import type {
  RouteCandidate,
  RouteSearchParams,
  RouteSearchResult,
  ScheduleResult,
  Store,
} from '../types';
import { findStoresNearRoute } from './corridor';
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
  const filtered =
    categories.length > 0 ? all.filter((s) => categories.includes(s.category)) : all;
  const hits = findStoresNearRoute(filtered, baseRoute.geometry, radiusKm);

  if (hits.length === 0) {
    return {
      params,
      baseRoute,
      visitable: [],
      unvisitable: [],
      scannedCount: filtered.length,
      notes: [
        ...notes,
        `경로 반경 ${radiusKm}km 안에 등록된 가게가 없습니다. 반경을 넓히거나 관리자 페이지에서 가게를 등록해 주세요.`,
      ],
    };
  }

  // 5) 출발지 → 각 가게 실제 도로 이동거리/시간
  const trimmed = hits.slice(0, Math.max(limit, 20));
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

  return {
    params,
    baseRoute,
    visitable: visitable.slice(0, limit),
    unvisitable,
    scannedCount: filtered.length,
    notes,
  };
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
): Promise<ScheduleResult | null> {
  const { params } = result;
  const stores: Store[] = result.visitable.slice(0, maxStops).map((c) => c.store);
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
