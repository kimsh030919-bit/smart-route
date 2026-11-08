/**
 * 희망 방문 시간 검증 (개발용)
 *   npx tsx scripts/verify-preferred.ts
 *
 * "저녁 20시쯤 가고 싶은 장소"가 실제로 20시 이후에 배치되는지 확인한다.
 */
import { DEMO_ORIGINS, DEMO_PLACES } from '../src/data/demoPlaces';
import { optimizeSchedule } from '../src/lib/optimizer';
import { formatClock } from '../src/lib/time';
import type { Place, PlaceSearchResult } from '../src/types';

function toPlace(r: PlaceSearchResult, preferredArrival?: string): Place {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    stayMinutes: r.defaultStayMinutes,
    priority: 'normal',
    business: r.business,
    preferredArrival,
    isDemo: true,
  };
}

const pick = (id: string) => DEMO_PLACES.find((p) => p.id === id)!;

const settings = {
  date: '2026-11-10', // 화요일
  startTime: '11:00',
  endTime: '23:00',
  mode: 'transit' as const,
  origin: DEMO_ORIGINS[0],
};

function run(label: string, places: Place[]) {
  const res = optimizeSchedule(places, settings);
  console.log(`\n=== ${label} ===`);
  for (const s of res.stops) {
    const want = s.place.preferredArrival ? ` (희망 ${s.place.preferredArrival} 이후)` : '';
    console.log(
      `  ${s.order}. ${s.place.name.padEnd(14)} 도착 ${formatClock(s.arrival)} / 이용 ${formatClock(
        s.start,
      )}~${formatClock(s.end)}${want}`,
    );
  }
  res.excluded.forEach((e) => console.log(`  ✗ ${e.place.name}: ${e.reason} — ${e.detail}`));
}

// 1) 희망 시간 없음 — 카페 A가 이른 시간에 배치된다
run('희망 시간 없음', [
  toPlace(pick('demo-attraction-c')),
  toPlace(pick('demo-park-e')),
  toPlace(pick('demo-cafe-a')),
]);

// 2) 카페 A를 20:00 이후로 희망
run('데모 카페 A = 20:00 이후 희망', [
  toPlace(pick('demo-attraction-c')),
  toPlace(pick('demo-park-e')),
  toPlace(pick('demo-cafe-a'), '20:00'),
]);

// 3) 불가능한 희망 시간 (관광지 C는 19:00 종료인데 20:00 희망)
run('데모 관광지 C = 20:00 이후 희망 (영업 09:00~19:00)', [
  toPlace(pick('demo-attraction-c'), '20:00'),
  toPlace(pick('demo-park-e')),
]);
