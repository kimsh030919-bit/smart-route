import type { Category, RouteGeometryPoint, Store } from '../types';
import { CATEGORY_META, categoryFromVworld } from '../data/categories';
import { bboxOfPoints, hasVworldKey, searchVworldPlaces } from './vworld';

/**
 * 경로 주변 장소를 지도 검색 API에서 실시간으로 찾는다.
 *
 * 왜 필요한가
 *  - 관리자 DB에 등록된 장소만 쓰면 등록이 없는 지역에서는 추천이 비어 버린다.
 *  - 그래서 DB에 없는 지역은 브이월드 검색 결과로 채운다.
 *
 * ⚠️ 한계 (화면에도 그대로 표시한다)
 *  - 브이월드 검색은 **영업시간/휴무/브레이크타임을 제공하지 않는다.**
 *    따라서 이렇게 찾은 장소는 전부 verified:false, "영업정보 없음"으로 둔다. 추측하지 않는다.
 *  - 브이월드 POI 검색은 "이름에 키워드가 들어간 장소"를 찾는 방식이라
 *    카테고리 기반 주변 검색(반경 내 모든 카페)과 달리 누락이 있을 수 있다.
 */

/** 업종 → 브이월드 검색 키워드 (이름 매칭이라 흔한 단어를 쓴다) */
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  cafe: ['카페', '커피'],
  food: ['식당', '맛집'],
  attraction: ['공원', '박물관'],
  shopping: ['마트', '시장'],
  cinema: ['영화관', '시네마'],
  park: ['공원'],
  etc: ['편의점'],
};

/** 업종 선택이 없을 때 쓰는 기본 키워드 */
const DEFAULT_KEYWORDS = ['카페', '식당', '공원', '마트'];

/** 경로를 n개 구간으로 쪼개 각 구간의 대표 좌표 묶음을 만든다 */
function splitSegments(geometry: RouteGeometryPoint[], count: number): RouteGeometryPoint[][] {
  if (geometry.length <= count) return [geometry];
  const size = Math.ceil(geometry.length / count);
  const out: RouteGeometryPoint[][] = [];
  for (let i = 0; i < geometry.length; i += size) {
    out.push(geometry.slice(i, i + size + 1));
  }
  return out.filter((s) => s.length > 0);
}

function keywordsFor(categories: Category[]): string[] {
  if (categories.length === 0) return DEFAULT_KEYWORDS;
  const set = new Set<string>();
  categories.forEach((c) => CATEGORY_KEYWORDS[c].forEach((k) => set.add(k)));
  return [...set].slice(0, 5);
}

export interface LiveSearchResult {
  stores: Store[];
  /** 실제로 호출한 검색 횟수 */
  requests: number;
  note: string | null;
}

/**
 * 경로 전 구간을 덮는 bbox들에 대해 키워드 검색을 돌려 장소를 모은다.
 * 호출 수 = 구간 수 × 키워드 수 (최대 3 × 5 = 15)
 */
export async function findLiveStoresAlongRoute(
  geometry: RouteGeometryPoint[],
  radiusKm: number,
  categories: Category[],
  routeLengthKm: number,
): Promise<LiveSearchResult> {
  if (!hasVworldKey() || geometry.length === 0) {
    return {
      stores: [],
      requests: 0,
      note: hasVworldKey() ? null : '지도 API 키가 없어 실시간 장소 검색을 사용할 수 없습니다.',
    };
  }

  const segmentCount = Math.min(3, Math.max(1, Math.ceil(routeLengthKm / 5)));
  const segments = splitSegments(geometry, segmentCount);
  const keywords = keywordsFor(categories);

  const tasks: Promise<Store[]>[] = [];
  for (const seg of segments) {
    const bbox = bboxOfPoints(seg, radiusKm);
    if (!bbox) continue;
    for (const keyword of keywords) {
      tasks.push(
        searchVworldPlaces(keyword, { type: 'place', size: 20, bbox })
          .then((items) =>
            items.map((p) => {
              const category = categoryFromVworld(keyword, p.name);
              const store: Store = {
                id: p.id,
                name: p.name,
                category,
                address: p.address,
                lat: p.lat,
                lng: p.lng,
                stayMinutes: CATEGORY_META[category].defaultStay,
                business: {
                  verified: false,
                  breaks: [],
                  closedWeekdays: [],
                  temporarilyClosed: false,
                  note: '브이월드 검색 결과 · 영업정보는 제공되지 않습니다.',
                  source: 'unknown',
                },
                tempClosures: [],
                dataKind: 'live',
                updatedAt: new Date().toISOString(),
              };
              return store;
            }),
          )
          .catch(() => []),
      );
    }
  }

  const results = await Promise.all(tasks);
  const merged = dedupe(results.flat());

  return {
    stores: merged,
    requests: tasks.length,
    note:
      merged.length > 0
        ? '경로 주변 장소 일부는 브이월드 검색 결과입니다. 영업시간·휴무·브레이크타임이 제공되지 않아 "영업정보 없음"으로 표시됩니다.'
        : null,
  };
}

/** 같은 이름이 50m 이내에 중복되면 하나만 남긴다 */
function dedupe(stores: Store[]): Store[] {
  const out: Store[] = [];
  for (const s of stores) {
    const dup = out.find(
      (o) =>
        o.name === s.name &&
        Math.abs(o.lat - s.lat) < 0.0005 &&
        Math.abs(o.lng - s.lng) < 0.0005,
    );
    if (!dup) out.push(s);
  }
  return out;
}

/** DB 장소와 실시간 검색 장소를 합친다. 같은 장소면 DB(영업정보 보유)를 우선한다. */
export function mergeWithDb(dbStores: Store[], liveStores: Store[]): Store[] {
  const result = [...dbStores];
  for (const live of liveStores) {
    const dup = result.find(
      (o) =>
        (o.id === live.id) ||
        (o.name === live.name &&
          Math.abs(o.lat - live.lat) < 0.001 &&
          Math.abs(o.lng - live.lng) < 0.001),
    );
    if (!dup) result.push(live);
  }
  return result;
}
