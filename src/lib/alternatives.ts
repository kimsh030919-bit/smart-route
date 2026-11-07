import type { Category, Place, PlaceSearchResult } from '../types';
import { CATEGORY_META } from '../data/categories';
import { DEMO_PLACES } from '../data/demoPlaces';
import { bboxOfPoints, hasVworldKey, searchVworldPlaces } from './vworld';
import { haversineKm } from './travel';

/**
 * 방문할 수 없게 된 장소의 "주변 대체 장소"를 찾는다.
 *
 * 예: 가려던 카페가 정기 휴무면 근처에 있는 같은 업종(카페/베이커리) 장소를 찾아 제안한다.
 *
 * ⚠️ 원칙
 *  - 대체 장소의 영업시간은 지도 검색 API가 제공하지 않는다. 추측하지 않고 "정보 확인 필요"로 둔다.
 *  - 업종이 같은 장소만 제안한다. 마땅한 곳이 없으면 아무것도 제안하지 않는다.
 */

/**
 * 업종별 검색 키워드.
 * 브이월드 검색은 장소 이름뿐 아니라 업종 분류 문자열도 매칭한다.
 * 그래서 '빵'을 넣으면 이름에 카페가 없는 베이커리(업종이 "…빵/도넛")까지 찾을 수 있다.
 */
const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  cafe: ['카페', '커피', '빵', '베이커리'],
  food: ['식당', '맛집'],
  attraction: ['박물관', '전시'],
  shopping: ['마트', '시장'],
  cinema: ['영화관', '시네마'],
  park: ['공원'],
  etc: ['편의점'],
};

export interface Alternative {
  result: PlaceSearchResult;
  /** 원래 가려던 장소에서의 직선거리(km) */
  distanceKm: number;
}

/**
 * place 주변 radiusKm 안에서 같은 업종의 대체 장소를 찾는다.
 * 브이월드 키가 있으면 실제 장소를, 없으면 내장 데모 장소를 사용한다.
 */
export async function findAlternatives(
  place: Place,
  radiusKm = 2,
  limit = 6,
): Promise<Alternative[]> {
  const found = hasVworldKey()
    ? await searchNearbyViaVworld(place, radiusKm)
    : searchNearbyInDemo(place, radiusKm);

  return found
    .filter((r) => r.id !== place.id && r.name !== place.name)
    .map((result) => ({ result, distanceKm: haversineKm(place, result) }))
    .filter((a) => a.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

async function searchNearbyViaVworld(
  place: Place,
  radiusKm: number,
): Promise<PlaceSearchResult[]> {
  const bbox = bboxOfPoints([{ lat: place.lat, lng: place.lng }], radiusKm);
  if (!bbox) return [];

  const keywords = CATEGORY_KEYWORDS[place.category];
  // 브이월드는 거리순이 아니라 자체 순위로 응답한다.
  // 반경 안에 후보가 100곳 넘게 있을 수 있어 넉넉히 받아 와서 직접 거리순으로 정렬한다.
  const batches = await Promise.all(
    keywords.map((keyword) =>
      searchVworldPlaces(keyword, { type: 'place', size: 100, bbox }).catch(
        () => [] as PlaceSearchResult[],
      ),
    ),
  );

  // 같은 업종만 남기고 중복 제거
  const seen = new Set<string>();
  const out: PlaceSearchResult[] = [];
  for (const r of batches.flat()) {
    if (r.category !== place.category) continue;
    const key = `${r.name}|${r.lat.toFixed(4)}|${r.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function searchNearbyInDemo(place: Place, radiusKm: number): PlaceSearchResult[] {
  return DEMO_PLACES.filter(
    (p) => p.category === place.category && haversineKm(place, p) <= radiusKm,
  );
}

/** 대체 장소를 일정에 넣을 Place 로 변환 */
export function alternativeToPlace(alt: Alternative, stayMinutes?: number): Place {
  const r = alt.result;
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    stayMinutes: stayMinutes ?? r.defaultStayMinutes ?? CATEGORY_META[r.category].defaultStay,
    priority: 'normal',
    business: { ...r.business, breaks: r.business.breaks.map((b) => ({ ...b })) },
    isDemo: r.isDemo,
  };
}
