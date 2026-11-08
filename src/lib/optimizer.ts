import type {
  ExcludedPlace,
  ExclusionReason,
  NaiveComparison,
  Origin,
  Place,
  Priority,
  ScheduleResult,
  Stop,
  Suggestion,
  TripSettings,
  Warning,
} from '../types';
import {
  EXCLUSION_LABELS,
  compileConstraint,
  effectiveHours,
  slotFor,
  type Compiled,
} from './businessHours';
import { MODE_SPECS, buildMatrix, haversineKm, type TravelMatrix } from './travel';
import { WEEKDAY_LABELS, formatClock, formatDuration, toHHMM, toMinutes, weekdayOf } from './time';

/**
 * 시간 제약 기반 경로 최적화 (Time-Constrained Route Optimization)
 *
 * 단순히 가까운 순서로 가지 않는다. 부분집합 DP(Held-Karp 변형)로
 * "영업시간 · 브레이크타임 · 정기휴무 · 라스트오더 · 체류시간 · 이동시간"을
 * 모두 만족하는 방문 순서 중 비용이 가장 낮은 순서를 찾는다.
 *
 * - 상태: (방문한 장소 집합, 마지막 장소) -> (종료시각, 비용) 파레토 최적 집합
 * - 전이: 다음 장소로 이동 -> 도착 -> 영업/브레이크 제약을 만족하는 가장 빠른 이용 시작 시각 계산
 * - 전부 방문이 불가능하면 최대한 많이 방문하는 해를 찾고, 제외된 장소의 이유를 설명한다.
 */

const PRIORITY_WEIGHT: Record<Priority, number> = {
  high: 10,
  normal: 4,
  low: 0,
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: '꼭 가야 함',
  normal: '보통',
  low: '여유 되면',
};

/** 대기시간 1분을 이동시간 몇 분어치로 볼지 */
const WAIT_WEIGHT = 0.6;
/** (mask,last)당 유지할 파레토 상태 수 */
const PARETO_CAP = 4;

interface State {
  node: number; // 0 = 출발지, 1..n = places[node-1]
  arrival: number;
  start: number;
  end: number;
  wait: number;
  travelFromPrev: number;
  kmFromPrev: number;
  totalTravel: number;
  totalKm: number;
  totalWait: number;
  cost: number;
  count: number;
  breakAvoided: boolean;
  waitedForOpen: boolean;
  nearLastOrder: boolean;
  nearClose: boolean;
  parent: State | null;
}

interface FailInfo {
  reason: ExclusionReason;
  detail: string;
  arrival: number;
}

interface SolveOutput {
  best: State | null;
  fails: Map<number, FailInfo>;
}

function dominates(a: State, b: State): boolean {
  return a.end <= b.end && a.cost <= b.cost;
}

function pushState(bucket: State[], s: State): void {
  for (const existing of bucket) {
    if (dominates(existing, s)) return;
  }
  for (let i = bucket.length - 1; i >= 0; i -= 1) {
    if (dominates(s, bucket[i])) bucket.splice(i, 1);
  }
  bucket.push(s);
  if (bucket.length > PARETO_CAP) {
    bucket.sort((x, y) => x.end - y.end || x.cost - y.cost);
    bucket.length = PARETO_CAP;
  }
}

/** DP 코어. candidates는 날짜만으로 이미 불가한 장소를 제외한 목록. */
function solve(
  candidates: Compiled[],
  matrix: TravelMatrix,
  startMinutes: number,
  endLimit: number,
): SolveOutput {
  const n = candidates.length;
  const fails = new Map<number, FailInfo>();
  if (n === 0) return { best: null, fails };

  const root: State = {
    node: 0,
    arrival: startMinutes,
    start: startMinutes,
    end: startMinutes,
    wait: 0,
    travelFromPrev: 0,
    kmFromPrev: 0,
    totalTravel: 0,
    totalKm: 0,
    totalWait: 0,
    cost: 0,
    count: 0,
    breakAvoided: false,
    waitedForOpen: false,
    nearLastOrder: false,
    nearClose: false,
    parent: null,
  };

  const total = 1 << n;
  // buckets[mask][last] (last: 0 = 출발지, 1..n)
  const buckets: State[][][] = Array.from({ length: total }, () =>
    Array.from({ length: n + 1 }, () => [] as State[]),
  );
  buckets[0][0].push(root);

  let best: State | null = null;
  const better = (a: State, b: State | null): boolean => {
    if (!b) return true;
    if (a.count !== b.count) return a.count > b.count;
    if (Math.abs(a.cost - b.cost) > 0.001) return a.cost < b.cost;
    return a.end < b.end;
  };

  const recordFail = (idx: number, reason: ExclusionReason, detail: string, arrival: number) => {
    const prev = fails.get(idx);
    if (!prev || arrival < prev.arrival) fails.set(idx, { reason, detail, arrival });
  };

  for (let mask = 0; mask < total; mask += 1) {
    for (let last = 0; last <= n; last += 1) {
      if (last > 0 && !(mask & (1 << (last - 1)))) continue;
      if (last === 0 && mask !== 0) continue;
      const bucket = buckets[mask][last];
      for (const state of bucket) {
        if (better(state, best)) best = state;

        for (let j = 1; j <= n; j += 1) {
          if (mask & (1 << (j - 1))) continue;
          const c = candidates[j - 1];
          const travel = matrix.minutes[last][j];
          const km = matrix.km[last][j];
          const arrival = state.end + travel;
          const slot = slotFor(c, arrival);
          if (!slot.ok) {
            recordFail(j - 1, slot.reason ?? 'unreachable', slot.detail ?? '방문 불가', arrival);
            continue;
          }
          if (slot.end! > endLimit) {
            recordFail(
              j - 1,
              'over_end_time',
              `이 장소를 포함하면 일정이 ${formatClock(slot.end!)}에 끝나 희망 종료 시간(${toHHMM(endLimit)})을 넘깁니다.`,
              arrival,
            );
            continue;
          }
          const orderIndex = state.count; // 0-based 방문 순서
          const addedCost =
            travel +
            slot.waitMinutes! * WAIT_WEIGHT +
            orderIndex * PRIORITY_WEIGHT[c.place.priority];

          const next: State = {
            node: j,
            arrival,
            start: slot.start!,
            end: slot.end!,
            wait: slot.waitMinutes!,
            travelFromPrev: travel,
            kmFromPrev: km,
            totalTravel: state.totalTravel + travel,
            totalKm: state.totalKm + km,
            totalWait: state.totalWait + slot.waitMinutes!,
            cost: state.cost + addedCost,
            count: state.count + 1,
            breakAvoided: !!slot.breakAvoided,
            waitedForOpen: !!slot.waitedForOpen,
            nearLastOrder: !!slot.nearLastOrder,
            nearClose: !!slot.nearClose,
            parent: state,
          };
          pushState(buckets[mask | (1 << (j - 1))][j], next);
        }
      }
    }
  }

  return { best, fails };
}

/** 행렬에서 지정한 인덱스들만 남긴 부분 행렬 */
function sliceMatrix(matrix: TravelMatrix, keep: number[]): TravelMatrix {
  const minutes = keep.map((i) => keep.map((j) => matrix.minutes[i]?.[j] ?? 0));
  const km = keep.map((i) => keep.map((j) => matrix.km[i]?.[j] ?? 0));
  return { minutes, km };
}

function reconstruct(best: State | null, candidates: Compiled[]): State[] {
  const chain: State[] = [];
  let cur = best;
  while (cur && cur.parent) {
    chain.push(cur);
    cur = cur.parent;
  }
  chain.reverse();
  // candidates 인덱스 유효성 방어
  return chain.filter((s) => s.node >= 1 && s.node <= candidates.length);
}

/** 거리만 고려한 단순 최근접 순서(비교용) */
function naiveNearest(
  places: Place[],
  matrix: TravelMatrix,
  compiled: Compiled[],
  startMinutes: number,
): NaiveComparison {
  const n = places.length;
  const visited = new Array(n + 1).fill(false);
  let cur = 0;
  let travel = 0;
  let km = 0;
  let time = startMinutes;
  let wait = 0;
  const orderNames: string[] = [];
  const conflicts: string[] = [];
  let broken = false;

  for (let step = 0; step < n; step += 1) {
    let bestJ = -1;
    let bestKm = Infinity;
    for (let j = 1; j <= n; j += 1) {
      if (visited[j]) continue;
      if (matrix.km[cur][j] < bestKm) {
        bestKm = matrix.km[cur][j];
        bestJ = j;
      }
    }
    if (bestJ < 0) break;
    visited[bestJ] = true;
    travel += matrix.minutes[cur][bestJ];
    km += matrix.km[cur][bestJ];
    time += matrix.minutes[cur][bestJ];
    const c = compiled[bestJ - 1];
    const slot = slotFor(c, time);
    orderNames.push(places[bestJ - 1].name);
    if (!slot.ok) {
      broken = true;
      conflicts.push(
        `${places[bestJ - 1].name}: ${formatClock(time)} 도착 → ${EXCLUSION_LABELS[slot.reason ?? 'unreachable']}`,
      );
      // 헛걸음 후에도 다음 장소로 이동했다고 가정 (체류시간 없음)
    } else {
      if (slot.breakAvoided) {
        conflicts.push(
          `${places[bestJ - 1].name}: ${formatClock(time)} 도착 → 브레이크 타임에 걸려 ${formatDuration(
            slot.waitMinutes!,
          )} 대기`,
        );
      } else if (slot.waitedForOpen && slot.waitMinutes! >= 15) {
        conflicts.push(
          `${places[bestJ - 1].name}: ${formatClock(time)} 도착 → 영업 시작 전이라 ${formatDuration(
            slot.waitMinutes!,
          )} 대기`,
        );
      }
      wait += slot.waitMinutes!;
      time = slot.end!;
    }
    cur = bestJ;
  }

  return {
    orderNames,
    travelMinutes: travel,
    distanceKm: km,
    waitMinutes: wait,
    conflictCount: conflicts.length,
    conflicts,
    endMinutes: broken ? null : time,
  };
}

export interface OptimizeOptions {
  /** 불가능할 때 대안 출발시간을 탐색할지 */
  searchAlternatives?: boolean;
  /** true면 최적화하지 않고 사용자가 입력한 순서를 그대로 검증한다 */
  fixedOrder?: boolean;
  /**
   * 외부에서 계산한 이동시간/거리 행렬 (인덱스 0 = 출발지, 1..n = places 순서).
   * 실제 도로 경로 API 결과를 넣으면 직선거리 추정 대신 그 값을 사용한다.
   */
  matrix?: TravelMatrix;
}

/** 사용자가 지정한 순서를 그대로 따라가며 시간 제약을 검증 */
function followFixedOrder(
  candidates: Compiled[],
  matrix: TravelMatrix,
  startMinutes: number,
  endLimit: number,
): SolveOutput {
  const fails = new Map<number, FailInfo>();
  let state: State = {
    node: 0,
    arrival: startMinutes,
    start: startMinutes,
    end: startMinutes,
    wait: 0,
    travelFromPrev: 0,
    kmFromPrev: 0,
    totalTravel: 0,
    totalKm: 0,
    totalWait: 0,
    cost: 0,
    count: 0,
    breakAvoided: false,
    waitedForOpen: false,
    nearLastOrder: false,
    nearClose: false,
    parent: null,
  };
  let last: State | null = null;

  candidates.forEach((c, i) => {
    const j = i + 1;
    const travel = matrix.minutes[state.node][j];
    const arrival = state.end + travel;
    const slot = slotFor(c, arrival);
    if (!slot.ok) {
      fails.set(i, {
        reason: slot.reason ?? 'unreachable',
        detail: slot.detail ?? '방문 불가',
        arrival,
      });
      return;
    }
    if (slot.end! > endLimit) {
      fails.set(i, {
        reason: 'over_end_time',
        detail: `이 순서로는 ${formatClock(slot.end!)}에 끝나 희망 종료 시간(${toHHMM(endLimit)})을 넘깁니다.`,
        arrival,
      });
      return;
    }
    const next: State = {
      node: j,
      arrival,
      start: slot.start!,
      end: slot.end!,
      wait: slot.waitMinutes!,
      travelFromPrev: travel,
      kmFromPrev: matrix.km[state.node][j],
      totalTravel: state.totalTravel + travel,
      totalKm: state.totalKm + matrix.km[state.node][j],
      totalWait: state.totalWait + slot.waitMinutes!,
      cost: state.cost + travel,
      count: state.count + 1,
      breakAvoided: !!slot.breakAvoided,
      waitedForOpen: !!slot.waitedForOpen,
      nearLastOrder: !!slot.nearLastOrder,
      nearClose: !!slot.nearClose,
      parent: state,
    };
    state = next;
    last = next;
  });

  return { best: last, fails };
}

export function optimizeSchedule(
  places: Place[],
  settings: TripSettings,
  options: OptimizeOptions = {},
): ScheduleResult {
  const mode = settings.mode;
  const weekday = weekdayOf(settings.date) ?? new Date().getDay();
  const startMinutes = toMinutes(settings.startTime) ?? 10 * 60;
  const rawEndLimit = toMinutes(settings.endTime) ?? 23 * 60;
  // 종료 시간이 출발 시간보다 빠르면(잘못 입력) 모든 장소가 조용히 제외되므로 하루 끝까지로 본다
  const endLimit = rawEndLimit > startMinutes ? rawEndLimit : 24 * 60 - 1;

  const origin: Origin =
    settings.origin ??
    (() => {
      const lat = places.reduce((s, p) => s + p.lat, 0) / Math.max(1, places.length);
      const lng = places.reduce((s, p) => s + p.lng, 0) / Math.max(1, places.length);
      return { name: '첫 장소 주변', address: '출발지 미설정 (장소들의 중심 기준)', lat, lng };
    })();

  // 요일별 영업시간 + 해당 날짜의 임시 휴무까지 반영해 제약을 만든다
  const compiledAll = places.map((p) => compileConstraint(p, weekday, settings.date));
  const excluded: ExcludedPlace[] = [];

  // 날짜만으로 불가능한 장소 (정기휴무/임시휴무 등)는 후보에서 제외
  const candidates: Compiled[] = [];
  const candidatePlaces: Place[] = [];
  compiledAll.forEach((c, i) => {
    if (c.staticFail) {
      excluded.push({ place: places[i], reason: c.staticFail.reason, detail: c.staticFail.detail });
    } else {
      candidates.push(c);
      candidatePlaces.push(places[i]);
    }
  });

  // 외부 행렬이 있으면 제외된 장소를 뺀 부분 행렬을 만들어 사용한다.
  const matrix = options.matrix
    ? sliceMatrix(
        options.matrix,
        [0, ...places.map((_, i) => (compiledAll[i].staticFail ? -1 : i + 1)).filter((i) => i > 0)],
      )
    : buildMatrix(origin, candidatePlaces, mode);
  const { best, fails } = options.fixedOrder
    ? followFixedOrder(candidates, matrix, startMinutes, endLimit)
    : solve(candidates, matrix, startMinutes, endLimit);
  const chain = reconstruct(best, candidates);

  const visitedIdx = new Set(chain.map((s) => s.node - 1));
  candidates.forEach((c, i) => {
    if (visitedIdx.has(i)) return;
    const f = fails.get(i);
    excluded.push({
      place: c.place,
      reason: f?.reason ?? 'unreachable',
      detail:
        f?.detail ??
        '다른 장소들의 영업시간·이동시간과 함께 배치할 수 있는 시간대를 찾지 못했습니다.',
    });
  });

  const stops: Stop[] = chain.map((s, i) => ({
    order: i + 1,
    place: candidates[s.node - 1].place,
    arrival: s.arrival,
    start: s.start,
    end: s.end,
    waitMinutes: s.wait,
    travelFromPrevMinutes: s.travelFromPrev,
    distanceFromPrevKm: s.kmFromPrev,
    flags: {
      waitedForOpen: s.waitedForOpen,
      breakAvoided: s.breakAvoided,
      unverified: !candidates[s.node - 1].place.business.verified,
      nearLastOrder: s.nearLastOrder,
      nearClose: s.nearClose,
    },
  }));

  const last = chain[chain.length - 1];
  const totalTravel = last?.totalTravel ?? 0;
  const totalKm = last?.totalKm ?? 0;
  const totalWait = last?.totalWait ?? 0;
  const totalStay = stops.reduce((sum, s) => sum + (s.end - s.start), 0);

  const comparison =
    stops.length >= 2 ? naiveNearest(candidatePlaces, matrix, candidates, startMinutes) : null;

  const feasible = stops.length === places.length && places.length > 0;

  // 출발지가 방문 장소들과 너무 멀면, 그게 진짜 원인이므로 먼저 알린다
  const nearestKm = places.length
    ? Math.min(...places.map((p) => haversineKm(origin, p)))
    : 0;
  const originTooFar = nearestKm > 50;

  const warnings = buildWarnings(stops, excluded, totalWait, weekday);
  if (originTooFar) {
    warnings.unshift({
      level: 'error',
      title: `출발지가 방문 장소들과 ${Math.round(nearestKm)}km 떨어져 있습니다`,
      message: `출발지 "${origin.name}"에서 가장 가까운 장소까지도 ${Math.round(
        nearestKm,
      )}km입니다. ${MODE_SPECS[mode].label} 기준 이동에만 ${formatDuration(
        (nearestKm / MODE_SPECS[mode].speedKmh) * 60,
      )} 걸려 영업시간 안에 도착하기 어렵습니다. 출발지가 올바른지 확인해 주세요.`,
    });
  }
  const suggestions = feasible
    ? []
    : buildSuggestions(
        places,
        settings,
        excluded,
        // 출발지가 터무니없이 멀면 출발 시간을 바꿔도 소용없으므로 대안 탐색을 건너뛴다
        !originTooFar && options.searchAlternatives !== false,
      );
  if (originTooFar) {
    suggestions.unshift({
      title: '출발지를 방문 장소 근처로 변경',
      message: `지금 출발지(${origin.name})는 방문 장소들과 ${Math.round(
        nearestKm,
      )}km 떨어져 있습니다. 출발 지역을 장소들과 가까운 곳으로 바꾸면 일정이 만들어집니다.`,
    });
  }

  return {
    feasible,
    stops,
    excluded,
    totalTravelMinutes: totalTravel,
    totalDistanceKm: totalKm,
    totalWaitMinutes: totalWait,
    totalStayMinutes: totalStay,
    startMinutes,
    endMinutes: last?.end ?? startMinutes,
    warnings,
    suggestions,
    comparison,
    mode,
    date: settings.date,
    estimateNote: `이동시간은 실시간 교통정보가 아닌 추정값입니다. (${MODE_SPECS[mode].description}, 직선거리 기반)`,
  };
}

function buildWarnings(
  stops: Stop[],
  excluded: ExcludedPlace[],
  totalWait: number,
  weekday: number,
): Warning[] {
  const warnings: Warning[] = [];

  for (const ex of excluded) {
    warnings.push({
      level: ex.reason === 'closed_weekday' || ex.reason === 'temporarily_closed' ? 'error' : 'warn',
      title: `${ex.place.name} · ${EXCLUSION_LABELS[ex.reason]}`,
      message: ex.detail,
    });
  }

  const breakAvoided = stops.filter((s) => s.flags.breakAvoided);
  for (const s of breakAvoided) {
    warnings.push({
      level: 'info',
      title: `${s.place.name} · 브레이크 타임 회피`,
      message: `브레이크 타임을 피해 ${formatClock(s.start)} 이용으로 조정했습니다. (도착 ${formatClock(s.arrival)})`,
    });
  }

  const waitedForOpen = stops.filter((s) => s.flags.waitedForOpen && s.waitMinutes >= 10);
  for (const s of waitedForOpen) {
    warnings.push({
      level: 'info',
      title: `${s.place.name} · 오픈 대기 ${formatDuration(s.waitMinutes)}`,
      message: `영업 시작(${s.place.business.open})보다 일찍 도착해 대기가 발생합니다.`,
    });
  }

  for (const s of stops.filter((x) => x.flags.nearLastOrder)) {
    warnings.push({
      level: 'warn',
      title: `${s.place.name} · 라스트 오더 임박`,
      message: `라스트 오더 ${s.place.business.lastOrder} 기준 30분 이내에 도착합니다. 주문을 먼저 하세요.`,
    });
  }

  for (const s of stops.filter((x) => x.flags.nearClose && !x.flags.nearLastOrder)) {
    warnings.push({
      level: 'warn',
      title: `${s.place.name} · 영업 종료 임박`,
      message: `체류 종료(${formatClock(s.end)})가 영업 종료(${s.place.business.close}) 30분 이내입니다.`,
    });
  }

  const unverified = stops.filter((s) => s.flags.unverified);
  if (unverified.length > 0) {
    warnings.push({
      level: 'warn',
      title: `영업정보 확인 필요 ${unverified.length}곳`,
      message: `${unverified
        .map((s) => s.place.name)
        .join(', ')} 의 영업시간이 확인되지 않아 시간 제약 없이 배치했습니다. 방문 전 직접 확인하거나 영업시간을 입력해 주세요.`,
    });
  }

  if (totalWait >= 45) {
    warnings.push({
      level: 'info',
      title: `대기시간 합계 ${formatDuration(totalWait)}`,
      message:
        '영업 시작/브레이크 타임을 기다리는 시간이 많습니다. 출발 시간을 늦추거나 체류시간을 조정하면 줄어들 수 있어요.',
    });
  }

  if (stops.length > 0) {
    warnings.push({
      level: 'info',
      title: `${WEEKDAY_LABELS[weekday]}요일 기준으로 계산`,
      message: '요일을 바꾸면 정기 휴무 때문에 결과가 달라질 수 있습니다.',
    });
  }

  return warnings;
}

function buildSuggestions(
  places: Place[],
  settings: TripSettings,
  excluded: ExcludedPlace[],
  searchAlternatives: boolean,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const weekday = weekdayOf(settings.date) ?? 0;

  for (const ex of excluded) {
    const info = ex.place.business;
    // 그 날짜에 실제로 적용되는 영업시간을 기준으로 안내한다 (요일별 설정 반영)
    const eff = effectiveHours(info, weekday);
    if (ex.reason === 'closed_weekday') {
      // 요일별 설정까지 반영해 실제로 문을 여는 요일을 계산한다
      const openDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !effectiveHours(info, d).closed);
      suggestions.push({
        title: `${ex.place.name} — 다른 날짜로 변경`,
        message: `${WEEKDAY_LABELS[weekday]}요일은 휴무입니다. ${openDays
          .map((d) => WEEKDAY_LABELS[d])
          .join('·')}요일에는 방문할 수 있습니다.`,
      });
    } else if (ex.reason === 'temporarily_closed') {
      suggestions.push({
        title: `${ex.place.name} — 임시 휴무 해제 또는 제외`,
        message: '임시 휴무 표시를 해제하거나, 이 장소를 일정에서 제외하고 다시 계산해 보세요.',
      });
    } else if (ex.reason === 'break_conflict') {
      const br = eff.breaks[0];
      suggestions.push({
        title: `${ex.place.name} — 브레이크 타임 회피`,
        message: br
          ? `브레이크 타임 ${br.start}~${br.end}입니다. 체류시간을 줄이거나, 출발 시간을 앞당겨 ${br.start} 이전에 방문하거나 ${br.end} 이후로 미뤄 보세요.`
          : '체류시간을 줄이거나 출발 시간을 조정해 보세요.',
      });
    } else if (ex.reason === 'arrive_after_close' || ex.reason === 'after_last_order') {
      suggestions.push({
        title: `${ex.place.name} — 더 일찍 출발`,
        message: `영업 종료(${eff.close ?? '확인 필요'})${
          eff.lastOrder ? ` · 라스트 오더(${eff.lastOrder})` : ''
        } 전에 도착하려면 출발 시간을 앞당기거나, 앞쪽 장소의 체류시간을 줄여야 합니다.`,
      });
    } else if (ex.reason === 'stay_too_long') {
      suggestions.push({
        title: `${ex.place.name} — 체류시간 조정`,
        message: `현재 체류시간 ${ex.place.stayMinutes}분을 줄이면 일정에 넣을 수 있습니다.`,
      });
    } else if (ex.reason === 'over_end_time') {
      suggestions.push({
        title: `${ex.place.name} — 희망 종료 시간 연장`,
        message: `희망 종료 시간(${settings.endTime})을 늦추거나, 장소 수/체류시간을 줄여 보세요.`,
      });
    } else {
      suggestions.push({
        title: `${ex.place.name} — 일정 분리`,
        message:
          '다른 장소들과 시간대가 겹쳐 하루에 모두 담기 어렵습니다. 우선순위가 낮은 장소를 다음 일정으로 분리해 보세요.',
      });
    }
  }

  // 대안 출발 시간 탐색 (전체 방문이 가능해지는 가장 가까운 출발 시간)
  if (searchAlternatives && places.length <= 10) {
    const alt = findFeasibleStartTime(places, settings);
    if (alt !== null) {
      suggestions.unshift({
        title: `출발 시간을 ${toHHMM(alt)}로 바꾸면 전체 방문 가능`,
        message: `같은 장소 구성으로 ${toHHMM(alt)}에 출발하면 ${places.length}곳을 모두 방문하는 일정이 만들어집니다.`,
      });
    }
  }

  const lowPriority = excluded.filter((e) => e.place.priority === 'low');
  if (lowPriority.length > 0) {
    suggestions.push({
      title: '우선순위가 낮은 장소 제외',
      message: `${lowPriority
        .map((e) => e.place.name)
        .join(', ')} 을(를) 제외하면 남은 장소로 더 여유로운 동선을 만들 수 있습니다.`,
    });
  }

  return suggestions;
}

/** 전체 방문이 가능해지는 출발 시간을 1시간 단위로 탐색 */
function findFeasibleStartTime(places: Place[], settings: TripSettings): number | null {
  const current = toMinutes(settings.startTime) ?? 10 * 60;
  const candidates: number[] = [];
  for (let t = 7 * 60; t <= 19 * 60; t += 60) {
    if (t !== current) candidates.push(t);
  }
  candidates.sort((a, b) => Math.abs(a - current) - Math.abs(b - current));

  for (const t of candidates) {
    const res = optimizeSchedule(
      places,
      { ...settings, startTime: toHHMM(t) },
      { searchAlternatives: false },
    );
    if (res.feasible) return t;
  }
  return null;
}
