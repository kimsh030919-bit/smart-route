import type { BusinessInfo, ExclusionReason, Place, TempClosure, TimeRange } from '../types';
import { WEEKDAY_LABELS, overlaps, toHHMM, toMinutes } from './time';

export interface MinuteRange {
  start: number;
  end: number;
}

/**
 * 해당 요일에 실제로 적용되는 영업 설정.
 * 요일별 설정(weeklyHours)이 있으면 그것이 기본 영업시간을 덮어쓴다.
 */
export interface EffectiveHours {
  /** 그 요일은 휴무 */
  closed: boolean;
  open?: string;
  close?: string;
  lastOrder?: string;
  breaks: TimeRange[];
  /** 요일별 설정이 적용됐는지 (UI 표시용) */
  fromWeekly: boolean;
}

export function effectiveHours(info: BusinessInfo, weekday: number): EffectiveHours {
  const day = info.weeklyHours?.[weekday] ?? null;
  if (day) {
    return {
      closed: day.closed,
      open: day.open,
      close: day.close,
      lastOrder: day.lastOrder,
      breaks: day.breaks ?? [],
      fromWeekly: true,
    };
  }
  return {
    closed: info.closedWeekdays.includes(weekday),
    open: info.open,
    close: info.close,
    lastOrder: info.lastOrder,
    breaks: info.breaks,
    fromWeekly: false,
  };
}

/** 해당 날짜가 임시 휴무로 등록돼 있는지 */
export function tempClosureOn(info: BusinessInfo, date?: string): TempClosure | null {
  if (!date) return null;
  return info.tempClosures?.find((c) => c.date === date) ?? null;
}

/** 영업정보가 "확인된" 상태인지 (영업 시작/종료가 모두 있어야 제약으로 사용) */
export function hasVerifiedHours(info: BusinessInfo, weekday?: number): boolean {
  if (!info.verified) return false;
  const eff = weekday === undefined ? null : effectiveHours(info, weekday);
  const open = eff ? eff.open : info.open;
  const close = eff ? eff.close : info.close;
  return toMinutes(open) !== null && toMinutes(close) !== null;
}

function toRanges(list: TimeRange[]): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const b of list) {
    const s = toMinutes(b.start);
    const e = toMinutes(b.end);
    if (s === null || e === null || e <= s) continue;
    out.push({ start: s, end: e });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function breakRanges(info: BusinessInfo, weekday?: number): MinuteRange[] {
  const list = weekday === undefined ? info.breaks : effectiveHours(info, weekday).breaks;
  return toRanges(list ?? []);
}

/**
 * 해당 요일에 방문 가능한 시간창 목록.
 * - 정기 휴무 / 임시 휴무 -> 빈 배열
 * - 영업정보 미확인 -> null (제약 없음. 임의로 영업시간을 만들어 내지 않고 UI에 "정보 확인 필요" 표시)
 */
export function openWindows(info: BusinessInfo, weekday: number): MinuteRange[] | null {
  if (info.temporarilyClosed) return [];
  const eff = effectiveHours(info, weekday);
  if (eff.closed) return [];
  if (!hasVerifiedHours(info, weekday)) return null;

  const open = toMinutes(eff.open)!;
  const close = toMinutes(eff.close)!;
  if (close <= open) return [];

  let windows: MinuteRange[] = [{ start: open, end: close }];
  for (const br of breakRanges(info, weekday)) {
    const next: MinuteRange[] = [];
    for (const w of windows) {
      if (!overlaps(w.start, w.end, br.start, br.end)) {
        next.push(w);
        continue;
      }
      if (br.start > w.start) next.push({ start: w.start, end: Math.min(br.start, w.end) });
      if (br.end < w.end) next.push({ start: Math.max(br.end, w.start), end: w.end });
    }
    windows = next;
  }
  return windows.filter((w) => w.end > w.start);
}

/** 반복 계산을 위해 미리 해석해 둔 시간 제약 */
export interface Compiled {
  place: Place;
  stay: number;
  /** null = 영업정보 미확인(제약 없음) */
  windows: MinuteRange[] | null;
  open: number | null;
  close: number | null;
  lastOrder: number | null;
  breaks: MinuteRange[];
  /** 날짜만으로 이미 방문 불가인 경우 */
  staticFail: { reason: ExclusionReason; detail: string } | null;
}

export function compileConstraint(place: Place, weekday: number, date?: string): Compiled {
  const info = place.business;
  const stay = Math.max(5, place.stayMinutes);
  const eff = effectiveHours(info, weekday);
  const base: Compiled = {
    place,
    stay,
    windows: null,
    open: toMinutes(eff.open),
    close: toMinutes(eff.close),
    lastOrder: toMinutes(eff.lastOrder),
    breaks: breakRanges(info, weekday),
    staticFail: null,
  };

  // 날짜 지정 임시 휴무가 정기 휴무보다 우선한다
  const temp = tempClosureOn(info, date);
  if (temp) {
    return {
      ...base,
      windows: [],
      staticFail: {
        reason: 'temporarily_closed',
        detail: temp.reason
          ? `${temp.date} 임시 휴무입니다. (${temp.reason})`
          : `${temp.date} 임시 휴무로 등록된 날짜입니다.`,
      },
    };
  }
  if (info.temporarilyClosed) {
    return {
      ...base,
      windows: [],
      staticFail: { reason: 'temporarily_closed', detail: '임시 휴무로 등록된 장소입니다.' },
    };
  }
  if (eff.closed) {
    return {
      ...base,
      windows: [],
      staticFail: {
        reason: 'closed_weekday',
        detail: eff.fromWeekly
          ? `${WEEKDAY_LABELS[weekday]}요일은 휴무로 설정되어 있습니다.`
          : `${WEEKDAY_LABELS[weekday]}요일은 정기 휴무입니다.`,
      },
    };
  }

  const windows = openWindows(info, weekday);
  if (windows !== null && windows.length === 0) {
    return {
      ...base,
      windows,
      staticFail: {
        reason: 'closed_weekday',
        detail: '입력된 영업시간으로는 해당 날짜에 방문할 수 있는 시간이 없습니다.',
      },
    };
  }
  if (windows !== null && !windows.some((w) => w.end - w.start >= stay)) {
    return {
      ...base,
      windows,
      staticFail: {
        reason: 'stay_too_long',
        detail: `체류시간 ${stay}분을 담을 수 있는 영업 구간이 없습니다. (브레이크 타임으로 영업시간이 나뉘어 있을 수 있어요)`,
      },
    };
  }
  return { ...base, windows };
}

export interface SlotResult {
  ok: boolean;
  start?: number;
  end?: number;
  waitMinutes?: number;
  breakAvoided?: boolean;
  waitedForOpen?: boolean;
  nearLastOrder?: boolean;
  nearClose?: boolean;
  reason?: ExclusionReason;
  detail?: string;
}

/**
 * 도착시각(arrival)에 체류시간을 소화할 수 있는 가장 빠른 시작 시각을 찾는다.
 * - 영업 시작 전 도착 -> 오픈까지 대기
 * - 브레이크 타임과 겹침 -> 브레이크 종료 후로 이동
 * - 라스트 오더 이후 시작 불가
 */
export function slotFor(c: Compiled, arrival: number): SlotResult {
  if (c.staticFail) return { ok: false, ...c.staticFail };

  // 영업정보 미확인 -> 시간 제약 없이 배치
  if (c.windows === null) {
    return {
      ok: true,
      start: arrival,
      end: arrival + c.stay,
      waitMinutes: 0,
      waitedForOpen: false,
      breakAvoided: false,
      nearLastOrder: false,
      nearClose: false,
    };
  }

  for (const w of c.windows) {
    const start = Math.max(arrival, w.start);
    if (start + c.stay > w.end) continue;
    if (c.lastOrder !== null && start > c.lastOrder) {
      return {
        ok: false,
        reason: 'after_last_order',
        detail: `라스트 오더 ${toHHMM(c.lastOrder)} 이후에 도착하게 됩니다.`,
      };
    }
    const end = start + c.stay;
    return {
      ok: true,
      start,
      end,
      waitMinutes: start - arrival,
      waitedForOpen: c.open !== null && arrival < c.open,
      breakAvoided: c.breaks.some((b) => arrival < b.end && start >= b.end),
      nearLastOrder: c.lastOrder !== null && c.lastOrder - start <= 30,
      nearClose: c.close !== null && c.close - end <= 30,
    };
  }

  if (c.close !== null && arrival >= c.close) {
    return {
      ok: false,
      reason: 'arrive_after_close',
      detail: `영업 종료 ${toHHMM(c.close)} 이후에 도착하게 됩니다.`,
    };
  }
  const hit = c.breaks.find((b) => overlaps(arrival, arrival + c.stay, b.start, b.end));
  if (hit) {
    return {
      ok: false,
      reason: 'break_conflict',
      detail: `브레이크 타임 ${toHHMM(hit.start)}~${toHHMM(hit.end)}과 겹치고, 그 이후에는 체류시간 ${c.stay}분을 확보할 수 없습니다.`,
    };
  }
  return {
    ok: false,
    reason: 'stay_too_long',
    detail: `도착 시각 기준으로 체류시간 ${c.stay}분을 확보할 수 없습니다.`,
  };
}

/** 단건 확인용 */
export function findSlot(
  place: Place,
  arrival: number,
  weekday: number,
  date?: string,
): SlotResult {
  return slotFor(compileConstraint(place, weekday, date), arrival);
}

export function formatRange(r: TimeRange): string {
  return `${r.start}~${r.end}`;
}

/**
 * 영업시간 요약.
 * weekday 를 주면 그 요일에 실제 적용되는 시간을, 없으면 기본 영업시간을 보여 준다.
 */
export function hoursSummary(info: BusinessInfo, weekday?: number): string {
  if (info.temporarilyClosed) return '임시 휴무';
  if (weekday !== undefined) {
    const eff = effectiveHours(info, weekday);
    if (eff.closed) return `${WEEKDAY_LABELS[weekday]}요일 휴무`;
    if (!hasVerifiedHours(info, weekday)) return '정보 확인 필요';
    return `${eff.open}~${eff.close}`;
  }
  if (!hasVerifiedHours(info)) return '정보 확인 필요';
  return `${info.open}~${info.close}`;
}

/** 요일별 설정까지 반영한 휴무 요일 목록 */
export function closedDaysSummary(info: BusinessInfo): string {
  if (!info.verified) return '정보 확인 필요';
  const closed: number[] = [];
  for (let d = 0; d < 7; d += 1) {
    if (effectiveHours(info, d).closed) closed.push(d);
  }
  if (closed.length === 0) return '정기 휴무 없음';
  if (closed.length === 7) return '상시 휴무';
  return `${closed.map((d) => WEEKDAY_LABELS[d]).join('·')}요일 휴무`;
}

export function breaksSummary(info: BusinessInfo, weekday?: number): string {
  if (!info.verified) return '정보 확인 필요';
  const list = weekday === undefined ? info.breaks : effectiveHours(info, weekday).breaks;
  if (!list || list.length === 0) return '없음';
  return list.map(formatRange).join(', ');
}

/**
 * 그 날짜에 "늦어도 몇 시까지 도착해야 하는지" (방문 마감 시각, 분 단위)
 *
 * 계산 기준
 *  - 영업 종료 시각에서 머물 시간을 뺀 시각까지는 도착해야 한다
 *  - 라스트 오더가 있으면 그보다 늦게 도착할 수 없다
 *  - 브레이크 타임으로 영업 구간이 나뉘면 마지막 구간을 기준으로 한다
 *
 * 영업정보가 없거나 그날 휴무면 null.
 */
export function latestArrival(
  info: BusinessInfo,
  weekday: number,
  stayMinutes: number,
  date?: string,
): number | null {
  if (tempClosureOn(info, date)) return null;
  if (info.temporarilyClosed) return null;

  const windows = openWindows(info, weekday);
  if (windows === null || windows.length === 0) return null;

  const stay = Math.max(5, stayMinutes);
  const lastOrder = toMinutes(effectiveHours(info, weekday).lastOrder);

  let best: number | null = null;
  for (const w of windows) {
    let limit = w.end - stay;
    if (lastOrder !== null) limit = Math.min(limit, lastOrder);
    if (limit < w.start) continue; // 이 구간에서는 체류시간을 못 채운다
    if (best === null || limit > best) best = limit;
  }
  return best;
}

/** 등록된 임시 휴무 날짜 요약 (가까운 날짜 순, 최대 3개) */
export function tempClosureSummary(info: BusinessInfo): string {
  const list = info.tempClosures ?? [];
  if (list.length === 0) return '없음';
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const head = sorted.slice(0, 3).map((c) => c.date).join(', ');
  return list.length > 3 ? `${head} 외 ${list.length - 3}건` : head;
}

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  closed_weekday: '정기 휴무',
  temporarily_closed: '임시 휴무',
  arrive_after_close: '영업 종료 후 도착',
  break_conflict: '브레이크 타임 충돌',
  stay_too_long: '체류시간 확보 불가',
  after_last_order: '라스트 오더 경과',
  over_end_time: '희망 종료 시간 초과',
  unreachable: '동선 구성 불가',
};
