import { CATEGORY_META, categoryFromKakao } from '../data/categories';
import type { Origin, PlaceSearchResult } from '../types';
import { hasVworldKey, searchVworldOrigins, searchVworldPlaces } from './vworld';
import { haversineKm } from './travel';
import { applyEstimates } from './estimatedHours';
import { hasGoogleKey, searchGooglePlaces } from './googlePlaces';

export type SearchSource = 'google' | 'kakao' | 'vworld';

export interface SearchResponse {
  source: SearchSource;
  results: PlaceSearchResult[];
  /** 사용자에게 보여줄 안내 (없으면 null) */
  notice: string | null;
}

const SOURCE_LABELS: Record<SearchSource, string> = {
  google: '구글 지도 (영업시간 제공)',
  kakao: '카카오맵 검색',
  vworld: '브이월드 검색',
};

export function sourceLabel(s: SearchSource): string {
  return SOURCE_LABELS[s];
}

/**
 * 출발지에서 가까운 순으로 정렬하고 거리(km)를 채운다.
 * 출발지가 없으면 원래 순서(관련도순)를 유지한다.
 */
export function sortByDistance(
  results: PlaceSearchResult[],
  origin?: Origin | null,
): PlaceSearchResult[] {
  // 영업정보가 없는 장소는 업종 평균 기준 추정값으로 채운다 (출처는 'estimated'로 구분)
  const filled = applyEstimates(results);
  if (!origin) return filled;
  return filled
    .map((r) => ({ ...r, distanceKm: haversineKm({ lat: origin.lat, lng: origin.lng }, r) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * 브이월드 검색: 출발지가 있으면 가까운 영역(bbox)부터 넓혀 가며 찾는다.
 *  8km → 25km → 전국, 그래도 없으면 주소(type=address)로 재시도
 */
async function searchVworldNearby(
  keyword: string,
  origin?: Origin | null,
): Promise<PlaceSearchResult[]> {
  const radii: (number | undefined)[] = origin ? [8, 25, undefined] : [undefined];
  for (const radiusKm of radii) {
    const found = await searchVworldPlaces(keyword, { type: 'place', origin, radiusKm });
    if (found.length > 0) return found;
  }
  return searchVworldPlaces(keyword, { type: 'address', origin });
}

/** 현재 사용할 수 있는 검색 소스 목록 (우선순위 순) */
export function availableSearchSources(): SearchSource[] {
  const out: SearchSource[] = [];
  // 실제 영업시간을 주는 구글을 가장 앞에 둔다
  if (hasGoogleKey()) out.push('google');
  if (typeof window !== 'undefined' && window.kakao?.maps?.services) out.push('kakao');
  if (hasVworldKey()) out.push('vworld');
  return out;
}

/**
 * 장소 검색.
 * - kakao : 카카오맵 키워드 검색 (상호 중심, 영업시간은 제공하지 않음)
 * - vworld: 브이월드 검색 API 2.0 (지명/주소 중심, 영업시간 없음)
 *
 * 카카오·브이월드는 영업정보를 주지 않으므로 verified: false("정보 확인 필요")로 담기고,
 * 담은 뒤 OpenStreetMap 에서 실제 영업시간을 자동으로 채운다. (lib/osmHours.ts)
 */
export async function searchPlaces(
  keyword: string,
  origin?: Origin | null,
  preferred: SearchSource | 'auto' = 'auto',
): Promise<SearchResponse> {
  const available = availableSearchSources();
  if (available.length === 0) {
    throw new Error(
      '장소를 검색할 수 있는 지도 API 키가 설정되어 있지 않습니다. .env 에 VITE_VWORLD_API_KEY 또는 VITE_KAKAO_MAP_KEY 를 넣어 주세요.',
    );
  }
  const source: SearchSource =
    preferred !== 'auto' && available.includes(preferred) ? preferred : available[0];

  if (source === 'google') {
    const results = await searchGooglePlaces(keyword, origin);
    const withHours = results.filter((r) => r.business.source === 'google').length;
    return {
      source: 'google',
      results: sortByDistance(results, origin),
      notice:
        results.length > 0
          ? `구글 지도 검색 결과입니다. ${withHours}곳은 구글에 등록된 실제 영업시간(요일별·브레이크 타임 포함)을 그대로 가져왔습니다. 라스트 오더와 임시 휴무는 구글이 제공하지 않아 직접 입력해야 합니다.`
          : null,
    };
  }

  if (source === 'vworld') {
    const merged = await searchVworldNearby(keyword, origin);
    return {
      source: 'vworld',
      results: sortByDistance(merged, origin),
      notice:
        merged.length > 0
          ? '브이월드(공간정보 오픈플랫폼) 검색 결과입니다. 브이월드는 영업시간·휴무·브레이크타임을 제공하지 않아 "정보 확인 필요"로 추가되며, 직접 입력하면 동선 계산에 반영됩니다.'
          : null,
    };
  }

  // kakao
  const kakao = window.kakao!;
  const places = new kakao.maps.services.Places();
  const options: { size: number; location?: kakao.maps.LatLng; radius?: number } = { size: 15 };
  if (origin) {
    options.location = new kakao.maps.LatLng(origin.lat, origin.lng);
    options.radius = 20000;
  }

  const items = await new Promise<kakao.maps.services.PlaceSearchResultItem[]>((resolve, reject) => {
    places.keywordSearch(
      keyword,
      (data, status) => {
        if (status === kakao.maps.services.Status.OK) resolve(data);
        else if (status === kakao.maps.services.Status.ZERO_RESULT) resolve([]);
        else reject(new Error('카카오 장소 검색에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
      },
      options,
    );
  });

  const results: PlaceSearchResult[] = items.map((item) => {
    const category = categoryFromKakao(item.category_group_code, item.place_name);
    return {
      id: `kakao-${item.id}`,
      name: item.place_name,
      category,
      address: item.road_address_name || item.address_name,
      lat: Number(item.y),
      lng: Number(item.x),
      defaultStayMinutes: CATEGORY_META[category].defaultStay,
      business: {
        verified: false,
        breaks: [],
        closedWeekdays: [],
        temporarilyClosed: false,
        note: '카카오 장소 검색은 영업시간을 제공하지 않습니다. 직접 입력하거나 방문 전 확인하세요.',
        source: 'unknown',
      },
    };
  });

  return {
    source: 'kakao',
    results: sortByDistance(results, origin),
    notice:
      results.length > 0
        ? '카카오맵 검색 결과입니다. 영업시간·휴무·브레이크타임은 제공되지 않아 "정보 확인 필요"로 추가되며, 직접 입력하면 동선 계산에 반영됩니다.'
        : null,
  };
}

/** 주소/지명으로 출발지 좌표 찾기 (카카오 → 브이월드 순으로 사용 가능한 것 사용) */
export async function searchOrigin(query: string): Promise<Origin[]> {
  const kakao = typeof window !== 'undefined' ? window.kakao : undefined;
  if (kakao?.maps?.services) {
    const places = new kakao.maps.services.Places();
    const items = await new Promise<kakao.maps.services.PlaceSearchResultItem[]>((resolve, reject) => {
      places.keywordSearch(
        query,
        (data, status) => {
          if (status === kakao.maps.services.Status.OK) resolve(data);
          else if (status === kakao.maps.services.Status.ZERO_RESULT) resolve([]);
          else reject(new Error('출발지 검색에 실패했습니다.'));
        },
        { size: 8 },
      );
    });
    return items.map((item) => ({
      name: item.place_name,
      address: item.road_address_name || item.address_name,
      lat: Number(item.y),
      lng: Number(item.x),
    }));
  }

  if (hasVworldKey()) return searchVworldOrigins(query);

  if (hasGoogleKey()) {
    const found = await searchGooglePlaces(query).catch(() => []);
    return found.slice(0, 8).map((p) => ({
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
    }));
  }
  return [];
}

/** 주소/지명 검색이 가능한 환경인지 */
export function canSearchOrigin(kakaoReady: boolean): boolean {
  return kakaoReady || hasVworldKey() || hasGoogleKey();
}
