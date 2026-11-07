import type { RouteGeometryPoint, Store } from '../types';
import { haversineKm } from './travel';

/**
 * 경로 주변(코리도) 탐색.
 *
 * 경로 좌표열(폴리라인)에서 각 가게까지의 수직 거리(이탈 거리)와,
 * 경로 시작점 기준 진행 거리를 계산해 "경로에서 크게 벗어나지 않는 가게"를 추린다.
 */

interface Plane {
  x: number; // km
  y: number; // km
}

/** 위경도 → 로컬 평면(km). 짧은 구간에서는 충분히 정확하다. */
function toPlane(lat: number, lng: number, lat0: number): Plane {
  return {
    x: lng * 111.32 * Math.cos((lat0 * Math.PI) / 180),
    y: lat * 110.57,
  };
}

/** 점 P 에서 선분 AB 까지의 거리(km)와, A에서 수선의 발까지의 거리(km) */
function pointToSegment(p: Plane, a: Plane, b: Plane): { dist: number; along: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    return { dist: Math.hypot(p.x - a.x, p.y - a.y), along: 0 };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return {
    dist: Math.hypot(p.x - projX, p.y - projY),
    along: t * Math.sqrt(len2),
  };
}

export interface CorridorHit {
  store: Store;
  /** 경로 중심선에서 벗어난 거리(km) */
  detourKm: number;
  /** 경로 시작점에서의 진행 거리(km) */
  alongKm: number;
}

/**
 * 경로 주변 radiusKm 이내의 가게를 찾는다.
 * 반환값은 경로 진행 순서(alongKm) 오름차순.
 */
export function findStoresNearRoute(
  stores: Store[],
  geometry: RouteGeometryPoint[],
  radiusKm: number,
): CorridorHit[] {
  if (geometry.length === 0) return [];
  if (geometry.length === 1) {
    return stores
      .map((store) => ({
        store,
        detourKm: haversineKm(geometry[0], store),
        alongKm: 0,
      }))
      .filter((h) => h.detourKm <= radiusKm);
  }

  const lat0 = geometry[0].lat;
  const line = geometry.map((g) => toPlane(g.lat, g.lng, lat0));

  // 각 정점까지의 누적 거리
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  }

  const hits: CorridorHit[] = [];
  for (const store of stores) {
    const p = toPlane(store.lat, store.lng, lat0);
    let best = Infinity;
    let bestAlong = 0;
    for (let i = 1; i < line.length; i += 1) {
      const { dist, along } = pointToSegment(p, line[i - 1], line[i]);
      if (dist < best) {
        best = dist;
        bestAlong = cum[i - 1] + along;
      }
    }
    if (best <= radiusKm) {
      hits.push({ store, detourKm: best, alongKm: bestAlong });
    }
  }

  return hits.sort((a, b) => a.alongKm - b.alongKm);
}

/** 경로 전체 길이(km) — 폴리라인 기준 */
export function routeLengthKm(geometry: RouteGeometryPoint[]): number {
  let sum = 0;
  for (let i = 1; i < geometry.length; i += 1) {
    sum += haversineKm(geometry[i - 1], geometry[i]);
  }
  return sum;
}
