import type { RouteLeg, RouteGeometryPoint, RoutingProvider, TransportMode } from '../types';
import { MODE_SPECS, haversineKm } from './travel';

/**
 * 실제 도로 경로 계산.
 *
 * ⚠️ 브이월드는 길찾기 API를 제공하지 않는다. 그래서 라우팅은 별도 엔진을 쓴다.
 *
 *  1) OSRM (https://router.project-osrm.org) — 기본값, 키 불필요, CORS 허용
 *     · 공개 데모 서버는 **자동차 프로파일만** 제공한다. (도보/자전거 요청도 차량 경로로 응답)
 *     · 데모 서버는 테스트 용도이므로 실제 서비스에서는 자체 OSRM 또는 상용 API로 교체해야 한다.
 *  2) OpenRouteService — VITE_ORS_API_KEY 가 있으면 사용. 자동차/도보/자전거 프로파일을 각각 지원.
 *  3) 직선 추정 — 위 둘이 모두 실패하거나 대중교통인 경우. UI에 "추정"으로 표시한다.
 *
 * 대중교통 실시간 경로는 무료로 제공되는 공개 API가 없어 추정값만 제공한다. (ODsay 등은 별도 키 필요)
 */

const OSRM_BASE = (import.meta.env.VITE_OSRM_BASE ?? 'https://router.project-osrm.org').replace(
  /\/$/,
  '',
);
const ORS_KEY: string = (import.meta.env.VITE_ORS_API_KEY ?? '').trim();

export function hasOrsKey(): boolean {
  return ORS_KEY.length > 0;
}

export interface Coord {
  lat: number;
  lng: number;
}

const ORS_PROFILE: Record<TransportMode, string | null> = {
  car: 'driving-car',
  walk: 'foot-walking',
  bike: 'cycling-regular',
  transit: null,
};

/** 이동수단별 라우팅 지원 수준 */
export interface ModeSupport {
  realRoad: boolean;
  realDuration: boolean;
  label: string;
}

export function describeSupport(mode: TransportMode): ModeSupport {
  if (mode === 'transit') {
    return {
      realRoad: false,
      realDuration: false,
      label: '대중교통은 공개 경로 API가 없어 직선거리 기반 추정값입니다.',
    };
  }
  if (hasOrsKey() && ORS_PROFILE[mode]) {
    return { realRoad: true, realDuration: true, label: 'OpenRouteService 실제 경로' };
  }
  if (mode === 'car') {
    return { realRoad: true, realDuration: true, label: 'OSRM 실제 도로 경로' };
  }
  return {
    realRoad: true,
    realDuration: false,
    label: 'OSRM 도로 거리 기준 · 소요시간은 이동수단 속도로 환산한 추정값',
  };
}

/* ────────────────────────────── 단일 경로 ────────────────────────────── */

export async function getRoute(from: Coord, to: Coord, mode: TransportMode): Promise<RouteLeg> {
  if (mode !== 'transit') {
    if (hasOrsKey() && ORS_PROFILE[mode]) {
      const ors = await orsRoute(from, to, ORS_PROFILE[mode]!).catch(() => null);
      if (ors) return ors;
    }
    const osrm = await osrmRoute(from, to, mode).catch(() => null);
    if (osrm) return osrm;
  }
  return straightLeg(from, to, mode);
}

async function osrmRoute(from: Coord, to: Coord, mode: TransportMode): Promise<RouteLeg> {
  const url =
    `${OSRM_BASE}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = (await res.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('OSRM 경로 없음');
  const r = json.routes[0];
  const distanceKm = r.distance / 1000;
  const realDuration = mode === 'car';
  return {
    distanceKm,
    durationMin: realDuration ? r.duration / 60 : durationFromDistance(distanceKm, mode),
    geometry: r.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
    provider: 'osrm',
    realRoad: true,
    realDuration,
    note: realDuration
      ? 'OSRM 공개 데모 서버 기준 실제 도로 경로/소요시간'
      : 'OSRM 도로 거리(차량 경로) 기준 · 소요시간은 이동수단 평균속도 환산 추정',
  };
}

async function orsRoute(from: Coord, to: Coord, profile: string): Promise<RouteLeg> {
  const res = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
    method: 'POST',
    headers: {
      Authorization: ORS_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    }),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);
  const json = (await res.json()) as {
    features?: {
      properties: { summary: { distance: number; duration: number } };
      geometry: { coordinates: [number, number][] };
    }[];
  };
  const f = json.features?.[0];
  if (!f) throw new Error('ORS 경로 없음');
  return {
    distanceKm: f.properties.summary.distance / 1000,
    durationMin: f.properties.summary.duration / 60,
    geometry: f.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
    provider: 'ors',
    realRoad: true,
    realDuration: true,
    note: `OpenRouteService(${profile}) 실제 경로/소요시간`,
  };
}

function durationFromDistance(distanceKm: number, mode: TransportMode): number {
  const spec = MODE_SPECS[mode];
  return (distanceKm / spec.speedKmh) * 60 + spec.overheadMin;
}

function straightLeg(from: Coord, to: Coord, mode: TransportMode): RouteLeg {
  const spec = MODE_SPECS[mode];
  const distanceKm = haversineKm(from, to) * spec.detour;
  return {
    distanceKm,
    durationMin: durationFromDistance(distanceKm, mode),
    geometry: [
      { lng: from.lng, lat: from.lat },
      { lng: to.lng, lat: to.lat },
    ],
    provider: 'straight',
    realRoad: false,
    realDuration: false,
    note:
      mode === 'transit'
        ? '대중교통 공개 경로 API가 없어 직선거리 × 우회계수로 추정한 값입니다.'
        : '경로 API를 사용할 수 없어 직선거리로 추정한 값입니다.',
  };
}

/* ────────────────────────────── 거리 행렬 ────────────────────────────── */

export interface MatrixResult {
  /** [i][j] 이동거리(km) */
  km: number[][];
  /** [i][j] 이동시간(분) */
  minutes: number[][];
  provider: RoutingProvider;
  realRoad: boolean;
  realDuration: boolean;
}

/**
 * 좌표 목록 전체의 이동거리/시간 행렬.
 * OSRM table 서비스를 쓰고, 실패하면 직선 추정으로 대체한다.
 */
export async function getMatrix(points: Coord[], mode: TransportMode): Promise<MatrixResult> {
  if (points.length < 2) {
    return { km: [[0]], minutes: [[0]], provider: 'straight', realRoad: false, realDuration: false };
  }
  if (mode !== 'transit' && points.length <= 60) {
    const osrm = await osrmTable(points, mode).catch(() => null);
    if (osrm) return osrm;
  }
  return straightMatrix(points, mode);
}

async function osrmTable(points: Coord[], mode: TransportMode): Promise<MatrixResult> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const res = await fetch(`${OSRM_BASE}/table/v1/driving/${coords}?annotations=duration,distance`);
  if (!res.ok) throw new Error(`OSRM table ${res.status}`);
  const json = (await res.json()) as {
    code: string;
    durations?: (number | null)[][];
    distances?: (number | null)[][];
  };
  if (json.code !== 'Ok' || !json.durations || !json.distances) throw new Error('OSRM table 실패');

  const realDuration = mode === 'car';
  const km = json.distances.map((row) => row.map((v) => (v ?? 0) / 1000));
  const minutes = json.durations.map((row, i) =>
    row.map((v, j) => (realDuration ? (v ?? 0) / 60 : durationFromDistance(km[i][j], mode))),
  );
  return { km, minutes, provider: 'osrm', realRoad: true, realDuration };
}

function straightMatrix(points: Coord[], mode: TransportMode): MatrixResult {
  const spec = MODE_SPECS[mode];
  const n = points.length;
  const km: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const minutes: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      km[i][j] = haversineKm(points[i], points[j]) * spec.detour;
      minutes[i][j] = durationFromDistance(km[i][j], mode);
    }
  }
  return { km, minutes, provider: 'straight', realRoad: false, realDuration: false };
}

export function toGeometryPoints(coords: Coord[]): RouteGeometryPoint[] {
  return coords.map((c) => ({ lat: c.lat, lng: c.lng }));
}
