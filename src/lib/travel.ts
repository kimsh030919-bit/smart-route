import type { TransportMode } from '../types';

/**
 * 이동시간 추정.
 *
 * ⚠️ 실시간 교통정보 API를 사용하지 않는다.
 * 직선거리(Haversine)에 도심 우회계수와 이동수단별 평균 속도를 적용한 "추정값"이며,
 * UI에서도 항상 "추정"으로 표시한다.
 */

export interface ModeSpec {
  key: TransportMode;
  label: string;
  /** 평균 속도 km/h */
  speedKmh: number;
  /** 직선거리 -> 실제 경로 보정계수 */
  detour: number;
  /** 고정 추가시간(분): 주차/환승/대기 등 */
  overheadMin: number;
  description: string;
}

export const MODE_SPECS: Record<TransportMode, ModeSpec> = {
  walk: {
    key: 'walk',
    label: '도보',
    speedKmh: 4.5,
    detour: 1.25,
    overheadMin: 2,
    description: '평균 4.5km/h · 도심 우회 1.25배',
  },
  bike: {
    key: 'bike',
    label: '자전거',
    speedKmh: 13,
    detour: 1.25,
    overheadMin: 4,
    description: '평균 13km/h · 대여/주차 4분',
  },
  transit: {
    key: 'transit',
    label: '대중교통',
    speedKmh: 20,
    detour: 1.35,
    overheadMin: 9,
    description: '평균 20km/h · 도보+환승 9분',
  },
  car: {
    key: 'car',
    label: '자동차',
    speedKmh: 26,
    detour: 1.4,
    overheadMin: 7,
    description: '평균 26km/h · 주차 7분',
  },
};

export const MODE_LIST: ModeSpec[] = [
  MODE_SPECS.walk,
  MODE_SPECS.transit,
  MODE_SPECS.car,
  MODE_SPECS.bike,
];

export interface Coord {
  lat: number;
  lng: number;
}

/** 두 좌표 사이의 직선거리(km) */
export function haversineKm(a: Coord, b: Coord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 이동수단을 반영한 경로 거리(km) 추정 */
export function routeDistanceKm(a: Coord, b: Coord, mode: TransportMode): number {
  return haversineKm(a, b) * MODE_SPECS[mode].detour;
}

/** 이동시간(분) 추정. 같은 건물 수준(50m 이내)이면 1분. */
export function travelMinutes(a: Coord, b: Coord, mode: TransportMode): number {
  const spec = MODE_SPECS[mode];
  const straight = haversineKm(a, b);
  if (straight < 0.05) return 1;
  const km = straight * spec.detour;
  const minutes = (km / spec.speedKmh) * 60 + spec.overheadMin;
  // 5분 단위로 올림 (일정표 가독성)
  return Math.max(3, Math.ceil(minutes / 5) * 5);
}

export interface TravelMatrix {
  /** minutes[i][j] : i -> j 이동시간(분). 인덱스 0은 출발지. */
  minutes: number[][];
  km: number[][];
}

/**
 * 출발지 + 장소들로 이동시간/거리 행렬을 만든다.
 * 인덱스 0 = 출발지, 1..n = 장소
 */
export function buildMatrix(origin: Coord, places: Coord[], mode: TransportMode): TravelMatrix {
  const nodes = [origin, ...places];
  const n = nodes.length;
  const minutes: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const km: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      minutes[i][j] = travelMinutes(nodes[i], nodes[j], mode);
      km[i][j] = routeDistanceKm(nodes[i], nodes[j], mode);
    }
  }
  return { minutes, km };
}
