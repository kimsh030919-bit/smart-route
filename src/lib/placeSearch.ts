import { CATEGORY_META, categoryFromKakao } from '../data/categories';
import { searchDemoPlaces } from '../data/demoPlaces';
import type { Origin, PlaceSearchResult } from '../types';
import { hasVworldKey, searchVworldOrigins, searchVworldPlaces } from './vworld';

export type SearchSource = 'kakao' | 'vworld' | 'demo';

export interface SearchResponse {
  source: SearchSource;
  results: PlaceSearchResult[];
  /** 사용자에게 보여줄 안내 (없으면 null) */
  notice: string | null;
}

const SOURCE_LABELS: Record<SearchSource, string> = {
  kakao: '카카오맵 검색',
  vworld: '브이월드 검색',
  demo: '데모 데이터 검색',
};

export function sourceLabel(s: SearchSource): string {
  return SOURCE_LABELS[s];
}

/** 현재 사용할 수 있는 검색 소스 목록 (우선순위 순) */
export function availableSearchSources(): SearchSource[] {
  const out: SearchSource[] = [];
  if (typeof window !== 'undefined' && window.kakao?.maps?.services) out.push('kakao');
  if (hasVworldKey()) out.push('vworld');
  out.push('demo');
  return out;
}

/**
 * 장소 검색.
 * - kakao : 카카오맵 키워드 검색 (상호 중심, 영업시간은 제공하지 않음)
 * - vworld: 브이월드 검색 API 2.0 (지명/주소 중심, 영업시간 없음)
 * - demo  : 내장 데모 데이터 (영업시간/휴무/브레이크타임 포함)
 *
 * 어느 쪽이든 외부 API가 영업정보를 주지 않으므로 verified: false("정보 확인 필요")로 담긴다.
 */
export async function searchPlaces(
  keyword: string,
  origin?: Origin | null,
  preferred: SearchSource | 'auto' = 'auto',
): Promise<SearchResponse> {
  const available = availableSearchSources();
  const source: SearchSource =
    preferred !== 'auto' && available.includes(preferred) ? preferred : available[0];

  if (source === 'demo') {
    return { source: 'demo', results: searchDemoPlaces(keyword), notice: null };
  }

  if (source === 'vworld') {
    const results = await searchVworldPlaces(keyword, { type: 'place' });
    const fallback = results.length === 0 ? await searchVworldPlaces(keyword, { type: 'address' }) : [];
    const merged = results.length > 0 ? results : fallback;
    return {
      source: 'vworld',
      results: merged,
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
    results,
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
  return [];
}

/** 주소/지명 검색이 가능한 환경인지 */
export function canSearchOrigin(kakaoReady: boolean): boolean {
  return kakaoReady || hasVworldKey();
}
