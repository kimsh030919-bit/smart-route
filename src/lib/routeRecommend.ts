import type {
  RouteCandidate,
  RouteSearchParams,
  RouteSearchResult,
  ScheduleResult,
  Store,
} from '../types';
import { findStoresNearRoute, routeLengthKm } from './corridor';
import { haversineKm } from './travel';
import { findLiveStoresAlongRoute, mergeWithDb } from './liveStores';
import { describeSupport, getMatrix, getRoute } from './routing';
import { evaluateStore, storeToPlace } from './storeStatus';
import { getStores } from './storeDb';
import { optimizeSchedule } from './optimizer';
import { toMinutes } from './time';
import { STATUS_META } from './storeStatus';

/**
 * 경로 기반 가게 추천.
 *
 * 처리 순서 (요구사항 그대로)
 *  1. 출발지·도착지 좌표 확인
 *  2. 출발지 → 도착지 기본 이동 경로 계산 (실제 도로 경로)
 *  3. 경로 주변 DB 가게 검색
 *  4. 경로에서 크게 벗어나지 않는 가게 추출 (코리도 반경)
 *  5. 출발지에서 가까운 순으로 정렬 (실제 도로 이동거리 기준)
 *  6. 각 가게의 영업 여부·브레이크 타임 확인
 *  7. 방문 가능 / 방문 불가로 구분
 */
export async function searchAlongRoute(params: RouteSearchParams): Promise<RouteSearchResult> {
  const { origin, destination, mode, categories, radiusKm, limit, date, startTime } = params;
  const startMinutes = toMinutes(startTime) ?? 10 * 60;
  const notes: string[] = [];

  // 2) 기본 경로
  const baseRoute = await getRoute(origin, destination, mode);
  notes.push(`경로 계산: ${baseRoute.note}`);

  // 3~4) 경로 주변 가게 추출
  const all = getStores();
  const dbFiltered =
    categories.length > 0 ? all.filter((s) => categories.includes(s.category)) : all;

  // 3-b) DB에 등록이 없는 지역도 추천이 나오도록 경로 주변을 지도 검색으로 보충한다
  const live = await findLiveStoresAlongRoute(
    baseRoute.geometry,
    radiusKm,
    categories,
    routeLengthKm(baseRoute.geometry),
  ).catch(() => ({ stores: [] as typeof all, requests: 0, note: null as string | null }));

  const liveFiltered =
    categories.length > 0
      ? live.stores.filter((s) => categories.includes(s.category))
      : live.stores;

  const pool = mergeWithDb(dbFiltered, liveFiltered);
  if (live.note) notes.push(live.note);

  const hits = findStoresNearRoute(pool, baseRoute.geometry, radiusKm);

  if (hits.length === 0) {
    return {
      params,
      baseRoute,
      visitable: [],
      unvisitable: [],
      nearDestination: [],
      destinationArrivalMinutes: Math.round(startMinutes + baseRoute.durationMin),
      scannedCount: pool.length,
      notes: [
        ...notes,
        `경로 반경 ${radiusKm}km 안에서 장소를 찾지 못했습니다. 검색 범위를 넓히거나 업종 필터를 해제해 보세요.`,
      ],
    };
  }

  // 5) 출발지 → 각 장소 실제 도로 이동거리/시간
  //    영업정보가 등록된 DB 장소를 먼저 담고, 남는 자리를 지도 검색 결과로 채운다.
  //    (그렇지 않으면 검색 결과가 많을 때 휴무·브레이크타임을 가진 DB 장소가 밀려난다)
  const dbHits = hits.filter((h) => h.store.dataKind !== 'live');
  const liveHits = hits.filter((h) => h.store.dataKind === 'live');
  const trimmed = [...dbHits, ...liveHits].slice(0, Math.max(limit, 24));
  const matrix = await getMatrix([origin, ...trimmed.map((h) => h.store)], mode);
  const support = describeSupport(mode);
  if (!support.realRoad) notes.push(support.label);
  if (matrix.provider === 'straight' && mode !== 'transit') {
    notes.push('경로 API 응답이 없어 이동거리·시간을 직선거리로 추정했습니다.');
  }

  const candidates: RouteCandidate[] = trimmed.map((hit, i) => {
    const travelKm = matrix.km[0][i + 1];
    const travelMin = matrix.minutes[0][i + 1];
    const arrivalMinutes = Math.round(startMinutes + travelMin);
    return {
      store: hit.store,
      travelKm,
      travelMin,
      realRoad: matrix.realRoad,
      realDuration: matrix.realDuration,
      detourKm: hit.detourKm,
      alongKm: hit.alongKm,
      arrivalMinutes,
      // 6) 영업 여부 / 브레이크 타임 확인
      evaluation: evaluateStore(hit.store, date, arrivalMinutes),
    };
  });

  // 5) 출발지에서 가까운 순
  candidates.sort((a, b) => a.travelKm - b.travelKm);

  // 7) 방문 가능 / 불가 구분
  const visitable: RouteCandidate[] = [];
  const unvisitable: RouteCandidate[] = [];
  for (const c of candidates) {
    if (STATUS_META[c.evaluation.status].visitable) visitable.push(c);
    else unvisitable.push(c);
  }
  visitable.slice(0, limit).forEach((c, i) => {
    c.order = i + 1;
  });

  // 방문할 수 없는 장소에는 같은 업종의 가장 가까운 대체 장소를 붙인다
  attachAlternatives(unvisitable, visitable);

  // 도착지 주변 장소 (도착지 도착 예정 시각 기준)
  const destinationArrivalMinutes = Math.round(startMinutes + baseRoute.durationMin);
  const nearDestination = await buildDestinationCandidates(
    pool,
    params,
    destinationArrivalMinutes,
  ).catch(() => [] as RouteCandidate[]);

  return {
    params,
    baseRoute,
    visitable: visitable.slice(0, limit),
    unvisitable,
    nearDestination,
    destinationArrivalMinutes,
    scannedCount: pool.length,
    notes,
  };
}

/**
 * 방문할 수 없는 장소마다 "같은 업종 · 방문 가능 · 가장 가까운" 대체 장소를 찾아 붙인다.
 * (같은 업종이 없으면 제안하지 않는다 — 억지로 다른 업종을 권하지 않음)
 */
function attachAlternatives(unvisitable: RouteCandidate[], visitable: RouteCandidate[]): void {
  const MAX_ALT_KM = 5;
  for (const u of unvisitable) {
    const best = visitable
      .filter((v) => v.store.category === u.store.category && v.store.id !== u.store.id)
      .map((v) => ({ v, d: haversineKm(u.store, v.store) }))
      .filter((x) => x.d <= MAX_ALT_KM)
      .sort((a, b) => a.d - b.d)[0];
    if (best) u.alternative = { candidate: best.v, distanceKm: best.d };
  }
}

/** 도착지 주변 장소를 도착지 기준 실제 도로 거리로 정렬해 반환 */
async function buildDestinationCandidates(
  pool: Store[],
  params: RouteSearchParams,
  destinationArrivalMinutes: number,
): Promise<RouteCandidate[]> {
  const { destination, radiusKm, date, mode } = params;

  const near = pool
    .map((store) => ({ store, straightKm: haversineKm(destination, store) }))
    .filter((x) => x.straightKm <= Math.max(radiusKm, 1))
    .sort((a, b) => a.straightKm - b.straightKm)
    .slice(0, 12);

  if (near.length === 0) return [];

  const matrix = await getMatrix([destination, ...near.map((n) => n.store)], mode);

  const candidates: RouteCandidate[] = near.map((n, i) => {
    const travelKm = matrix.km[0][i + 1];
    const travelMin = matrix.minutes[0][i + 1];
    const arrivalMinutes = Math.round(destinationArrivalMinutes + travelMin);
    return {
      store: n.store,
      travelKm,
      travelMin,
      realRoad: matrix.realRoad,
      realDuration: matrix.realDuration,
      detourKm: n.straightKm,
      alongKm: 0,
      arrivalMinutes,
      evaluation: evaluateStore(n.store, date, arrivalMinutes),
    };
  });

  candidates.sort((a, b) => a.travelKm - b.travelKm);
  candidates.slice(0, 6).forEach((c, i) => {
    c.order = i + 1;
  });
  return candidates.slice(0, 6);
}

/**
 * 최적 일정 모드.
 * 거리순으로 고른 후보를 시간 제약 기반 최적화(기존 플래너 엔진)에 넣어
 * 영업시간·브레이크타임·체류시간을 모두 만족하는 방문 순서를 계산한다.
 * 이동시간/거리는 실제 도로 기준 행렬을 주입한다.
 */
export async function buildOptimizedPlan(
  result: RouteSearchResult,
  maxStops = 6,
  /** 반드시 포함할 장소 id (대체 장소로 교체했을 때 사용) */
  pinnedIds: string[] = [],
): Promise<ScheduleResult | null> {
  const { params } = result;

  // 대체 장소 등 고정 선택을 앞에 두고, 나머지는 거리순으로 채운다
  const everything = [...result.visitable, ...result.nearDestination];
  const pinned = pinnedIds
    .map((id) => everything.find((c) => c.store.id === id))
    .filter((c): c is RouteCandidate => !!c);
  const rest = result.visitable.filter((c) => !pinnedIds.includes(c.store.id));

  const picked: RouteCandidate[] = [];
  for (const c of [...pinned, ...rest]) {
    if (picked.some((p) => p.store.id === c.store.id)) continue;
    picked.push(c);
    if (picked.length >= maxStops) break;
  }

  const stores: Store[] = picked.map((c) => c.store);
  if (stores.length < 2) return null;

  const matrix = await getMatrix([params.origin, ...stores], params.mode);
  const places = stores.map((s) => storeToPlace(s, params.date));

  return optimizeSchedule(
    places,
    {
      date: params.date,
      startTime: params.startTime,
      endTime: '23:30',
      mode: params.mode,
      origin: params.origin,
    },
    {
      matrix: { km: matrix.km, minutes: matrix.minutes },
      searchAlternatives: false,
    },
  );
}
