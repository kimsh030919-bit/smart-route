import type { Origin, PlaceSearchResult } from '../types';
import { CATEGORY_META, categoryFromVworld } from '../data/categories';

/**
 * 브이월드(공간정보 오픈플랫폼, https://www.vworld.kr) 연동
 *
 * 제공받는 것
 *  - 배경지도 타일: WMTS/TMS (GetTile) — 이미지라 CORS 영향 없음, 키만 있으면 바로 사용
 *  - 지명/주소 검색: 검색 API 2.0 (/req/search)
 *  - 주소 → 좌표: 지오코더 API 2.0 (/req/address, request=getcoord)
 *  - 행정경계/건물 등 공간 데이터: 데이터 API (/req/data, GetFeature)
 *
 * 제공받지 못하는 것 (중요)
 *  - 영업시간 / 정기휴무 / 브레이크타임 / 라스트오더  → 브이월드에 없는 정보다.
 *    따라서 브이월드로 담은 장소는 verified: false("정보 확인 필요")로 두고 사용자가 입력한다.
 *  - 길찾기 / 실시간 이동시간                        → 브이월드에 없다. (이동시간은 계속 추정값)
 *
 * JSON API는 브라우저에서 직접 부르면 CORS에 막히므로 개발 서버 프록시(/vworld-api)를 경유한다.
 * (vite.config.ts 의 server.proxy 설정)
 */

export const VWORLD_API_KEY: string = (import.meta.env.VITE_VWORLD_API_KEY ?? '').trim();

export type VworldLayer = 'Base' | 'gray' | 'midnight' | 'Satellite' | 'Hybrid';

export interface VworldLayerMeta {
  key: VworldLayer;
  label: string;
  ext: 'png' | 'jpeg';
}

export const VWORLD_LAYERS: VworldLayerMeta[] = [
  { key: 'Base', label: '일반지도', ext: 'png' },
  { key: 'gray', label: '백지도', ext: 'png' },
  { key: 'midnight', label: '야간지도', ext: 'png' },
  { key: 'Satellite', label: '위성영상', ext: 'jpeg' },
  { key: 'Hybrid', label: '하이브리드', ext: 'png' },
];

export function hasVworldKey(): boolean {
  return VWORLD_API_KEY.length > 0;
}

/**
 * WMTS 타일 URL 템플릿 (OpenLayers XYZ 소스에 그대로 전달)
 * https://api.vworld.kr/req/wmts/1.0.0/{key}/{layer}/{z}/{y}/{x}.png
 */
export function tileUrlTemplate(layer: VworldLayer = 'Base'): string {
  const meta = VWORLD_LAYERS.find((l) => l.key === layer) ?? VWORLD_LAYERS[0];
  return `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/${meta.key}/{z}/{y}/{x}.${meta.ext}`;
}

/**
 * JSON API를 중계하는 프록시 경로.
 *  - 개발     : vite dev server (vite.config.ts 의 server.proxy)
 *  - 배포     : 서버리스 함수 (api/vworld/[...path].ts · netlify/functions/vworld.mts ·
 *               functions/vworld-api/[[path]].ts)
 *  - 다른 백엔드를 쓰면 VITE_VWORLD_PROXY_BASE 로 교체
 */
const API_BASE: string = (import.meta.env.VITE_VWORLD_PROXY_BASE ?? '/vworld-api').replace(
  /\/$/,
  '',
);

/**
 * 호출 방식
 *  - 'proxy' : 서버(프록시) 경유 fetch. 키를 서버에 둘 수 있어 가장 안전하다.
 *  - 'jsonp' : 브라우저에서 api.vworld.kr 을 직접 호출. 브이월드가 callback 파라미터(JSONP)를
 *              지원하므로 CORS 제약을 받지 않는다. 서버가 없는 정적 호스팅(GitHub Pages 등)에서 사용.
 *  - 'auto'  : 개발 환경은 proxy, 배포 환경은 jsonp (기본값)
 *
 * JSONP는 api.vworld.kr 의 스크립트를 페이지에서 실행하는 방식이라 그만큼 해당 도메인을 신뢰하게 된다.
 * 서버를 둘 수 있는 환경(Vercel/Netlify/Cloudflare)에서는 VITE_VWORLD_TRANSPORT=proxy 를 권장한다.
 */
type Transport = 'auto' | 'proxy' | 'jsonp';
const TRANSPORT: Transport = ((import.meta.env.VITE_VWORLD_TRANSPORT as Transport) ?? 'auto').trim() as Transport;

function resolveTransport(): 'proxy' | 'jsonp' {
  if (TRANSPORT === 'proxy' || TRANSPORT === 'jsonp') return TRANSPORT;
  return import.meta.env.DEV ? 'proxy' : 'jsonp';
}

let jsonpSeq = 0;

/** JSONP 호출 (CORS 우회). 12초 내 응답이 없으면 실패 처리. */
function jsonp<T>(path: string, params: Record<string, string>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('브라우저 환경에서만 호출할 수 있습니다.'));
      return;
    }
    jsonpSeq += 1;
    const cbName = `__vworldCb${jsonpSeq}_${Date.now().toString(36)}`;
    const qs = new URLSearchParams({ ...params, key: VWORLD_API_KEY, callback: cbName });
    const script = document.createElement('script');

    const globalScope = window as unknown as Record<string, unknown>;
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      delete globalScope[cbName];
      script.remove();
    };

    globalScope[cbName] = (data: T) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(
        new Error(
          '브이월드 API를 호출하지 못했습니다. 인증키의 활용 URL에 현재 도메인이 등록되어 있는지 확인해 주세요.',
        ),
      );
    };
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('브이월드 API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'));
    }, 12000);

    script.src = `https://api.vworld.kr${path}?${qs.toString()}`;
    document.head.appendChild(script);
  });
}

async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  if (resolveTransport() === 'jsonp') return jsonp<T>(path, params);
  try {
    return await getJsonViaProxy<T>(path, params);
  } catch (e) {
    // 'proxy'를 명시한 경우에는 그대로 실패시키고, auto 모드면 JSONP로 자동 폴백한다.
    if (TRANSPORT === 'proxy') throw e;
    return jsonp<T>(path, params);
  }
}

async function getJsonViaProxy<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: VWORLD_API_KEY }).toString();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}?${qs}`);
  } catch {
    throw new Error(
      '브이월드 API 호출에 실패했습니다. (네트워크 또는 프록시 미설정) 브라우저에서 직접 호출하면 CORS에 막히므로 프록시가 필요합니다.',
    );
  }
  if (res.status === 404) {
    throw new Error(
      '브이월드 프록시 경로(/vworld-api)를 찾을 수 없습니다. 서버리스 함수가 배포되지 않았거나 경로가 다릅니다.',
    );
  }
  if (!res.ok) {
    throw new Error(
      `브이월드 API 응답 오류 (${res.status}). 인증키의 활용 URL에 현재 도메인이 등록되어 있는지 확인해 주세요.`,
    );
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('브이월드 API가 JSON이 아닌 응답을 반환했습니다. (인증키/서비스 권한 확인 필요)');
  }
}

/* ────────────────────────────── 검색 API 2.0 ────────────────────────────── */

interface VworldSearchItem {
  id: string;
  title?: string;
  category?: string;
  address?: { zipcode?: string; category?: string; parcel?: string; road?: string; bldnm?: string };
  point?: { x: string; y: string };
}

interface VworldSearchResponse {
  response?: {
    status?: string;
    error?: { level?: string; code?: string; text?: string };
    record?: { total?: string; current?: string };
    result?: { items?: VworldSearchItem[] };
  };
}

export interface VworldSearchOptions {
  /** place: 지명/POI, address: 주소, district: 행정구역 */
  type?: 'place' | 'address' | 'district';
  size?: number;
  /** 검색 중심(선택). 지정하면 bbox로 주변 영역을 우선 검색한다. */
  origin?: Origin | null;
  /** bbox 반경(km) */
  radiusKm?: number;
  /** 직접 지정하는 bbox "minLng,minLat,maxLng,maxLat" (origin/radiusKm보다 우선) */
  bbox?: string;
}

/** 좌표 목록을 모두 포함하는 bbox 문자열 (padKm 만큼 여유) */
export function bboxOfPoints(
  points: { lat: number; lng: number }[],
  padKm: number,
): string | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const latRef = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = padKm / 111;
  const dLng = padKm / (111 * Math.max(0.2, Math.cos((latRef * Math.PI) / 180)));
  const f = (n: number) => n.toFixed(6);
  return [
    f(Math.min(...lngs) - dLng),
    f(Math.min(...lats) - dLat),
    f(Math.max(...lngs) + dLng),
    f(Math.max(...lats) + dLat),
  ].join(',');
}

/**
 * 출발지 중심의 bbox 문자열 "minLng,minLat,maxLng,maxLat"
 * (브이월드 검색 API는 EPSG:4326 기준 경도,위도 순서를 쓴다)
 */
function bboxAround(origin: Origin, radiusKm: number): string {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180)));
  const f = (n: number) => n.toFixed(6);
  return [
    f(origin.lng - dLng),
    f(origin.lat - dLat),
    f(origin.lng + dLng),
    f(origin.lat + dLat),
  ].join(',');
}

/**
 * 지명/주소 검색.
 * 응답에 영업정보가 없으므로 결과는 모두 verified: false 로 만든다.
 */
export async function searchVworldPlaces(
  query: string,
  { type = 'place', size = 20, origin = null, radiusKm, bbox }: VworldSearchOptions = {},
): Promise<PlaceSearchResult[]> {
  const params: Record<string, string> = {
    service: 'search',
    request: 'search',
    version: '2.0',
    crs: 'EPSG:4326',
    size: String(size),
    page: '1',
    query,
    type,
    format: 'json',
    errorformat: 'json',
  };
  if (type === 'address') params.category = 'road';
  if (bbox) params.bbox = bbox;
  else if (origin && radiusKm) params.bbox = bboxAround(origin, radiusKm);

  const json = await getJson<VworldSearchResponse>('/req/search', params);
  const status = json.response?.status;
  if (status === 'ERROR') {
    throw new Error(
      `브이월드 검색 실패: ${json.response?.error?.text ?? '알 수 없는 오류'} (인증키·활용 URL 확인)`,
    );
  }
  if (status === 'NOT_FOUND') return [];

  const items = json.response?.result?.items ?? [];
  return items
    .filter((it) => it.point && Number.isFinite(Number(it.point.x)) && Number.isFinite(Number(it.point.y)))
    .map((it) => {
      const name = it.title?.trim() || it.address?.bldnm?.trim() || '이름 없는 장소';
      const category = categoryFromVworld(it.category ?? '', name);
      return {
        id: `vworld-${it.id}`,
        name,
        category,
        address: it.address?.road || it.address?.parcel || '주소 정보 없음',
        lat: Number(it.point!.y),
        lng: Number(it.point!.x),
        defaultStayMinutes: CATEGORY_META[category].defaultStay,
        business: {
          verified: false,
          breaks: [],
          closedWeekdays: [],
          temporarilyClosed: false,
          note: '브이월드 검색은 영업시간을 제공하지 않습니다. 직접 입력하거나 방문 전 확인하세요.',
          source: 'unknown' as const,
        },
      } satisfies PlaceSearchResult;
    });
}

/* ───────────────────────────── 지오코더 API 2.0 ───────────────────────────── */

interface VworldGeocodeResponse {
  response?: {
    status?: string;
    error?: { text?: string };
    refined?: { text?: string };
    result?: { point?: { x: string; y: string } };
  };
}

/** 주소 → 좌표 (출발지 설정용). type: 'road' 도로명 / 'parcel' 지번 */
export async function geocodeVworld(
  address: string,
  type: 'road' | 'parcel' = 'road',
): Promise<Origin | null> {
  const json = await getJson<VworldGeocodeResponse>('/req/address', {
    service: 'address',
    request: 'getcoord',
    version: '2.0',
    crs: 'epsg:4326',
    address,
    type,
    refine: 'true',
    simple: 'false',
    format: 'json',
    errorformat: 'json',
  });
  const point = json.response?.result?.point;
  if (json.response?.status !== 'OK' || !point) return null;
  return {
    name: json.response?.refined?.text || address,
    address: json.response?.refined?.text || address,
    lat: Number(point.y),
    lng: Number(point.x),
  };
}

/**
 * 출발지 검색: 지명(place)으로 먼저 찾고, 없으면 도로명주소 지오코딩으로 보완.
 */
export async function searchVworldOrigins(query: string): Promise<Origin[]> {
  const byPlace = await searchVworldPlaces(query, { type: 'place', size: 8 });
  const origins: Origin[] = byPlace.map((p) => ({
    name: p.name,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
  }));
  if (origins.length > 0) return origins;

  const geocoded = await geocodeVworld(query).catch(() => null);
  return geocoded ? [geocoded] : [];
}
