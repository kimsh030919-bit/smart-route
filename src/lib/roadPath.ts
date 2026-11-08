/**
 * 실제 도로 경로 가져오기.
 *
 * ⚠️ 브이월드는 길찾기(라우팅) API를 제공하지 않는다. 그래서 경로선은 별도 엔진을 쓴다.
 *
 *  - OSRM 공개 데모 서버 (https://router.project-osrm.org) — 키 불필요, CORS 허용
 *  - 공개 데모 서버는 **자동차 프로파일만** 제공한다. 도보/자전거/대중교통을 골라도
 *    차량 도로 기준 경로가 나오므로, 화면에는 "자동차 도로 기준"이라고 표시한다.
 *  - 데모 서버는 테스트 용도이므로 실서비스에서는 자체 OSRM 또는 상용 API로 교체해야 한다.
 *  - 실패하면 null 을 돌려주고, 지도는 기존처럼 직선으로 그린다.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RoadPath {
  /** 도로를 따라가는 좌표열 */
  path: LatLng[];
  /** 전체 도로 이동거리(km) */
  distanceKm: number;
  /** 전체 소요시간(분) — 자동차 기준 */
  durationMin: number;
  /** 구간별(waypoint 사이) 도로 거리(km)와 시간(분) */
  legs: { distanceKm: number; durationMin: number }[];
}

const OSRM_BASE = (import.meta.env.VITE_OSRM_BASE ?? 'https://router.project-osrm.org').replace(
  /\/$/,
  '',
);

/**
 * 여러 지점을 순서대로 지나는 도로 경로를 한 번의 요청으로 가져온다.
 * (OSRM 은 좌표를 여러 개 받아 경유지로 처리한다)
 */
export async function fetchRoadPath(
  points: LatLng[],
  signal?: AbortSignal,
): Promise<RoadPath | null> {
  if (points.length < 2) return null;

  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      code: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs?: { distance: number; duration: number }[];
      }[];
    };
    if (json.code !== 'Ok' || !json.routes?.length) return null;

    const r = json.routes[0];
    return {
      path: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanceKm: r.distance / 1000,
      durationMin: r.duration / 60,
      legs: (r.legs ?? []).map((l) => ({
        distanceKm: l.distance / 1000,
        durationMin: l.duration / 60,
      })),
    };
  } catch {
    // 네트워크 오류 / 취소 — 직선 경로로 폴백한다
    return null;
  }
}
