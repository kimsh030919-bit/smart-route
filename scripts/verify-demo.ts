/**
 * 데모 시나리오 검증 스크립트 (개발용)
 *   npx tsx scripts/verify-demo.ts
 *
 * 브레이크 타임 때문에 순서가 바뀌는지, 휴무 장소가 걸러지는지를 콘솔로 확인한다.
 */
import { DEMO_ORIGINS, DEMO_PLACES, DEMO_SCENARIOS, nextDateForWeekday } from '../src/data/demoPlaces';
import { optimizeSchedule } from '../src/lib/optimizer';
import { formatClock, formatDuration } from '../src/lib/time';
import type { Place, PlaceSearchResult } from '../src/types';

function toPlace(r: PlaceSearchResult): Place {
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
    isDemo: true,
  };
}

for (const s of DEMO_SCENARIOS) {
  const places = s.placeIds.map((id) => toPlace(DEMO_PLACES.find((p) => p.id === id)!));
  const settings = {
    date: nextDateForWeekday(s.weekday),
    startTime: s.startTime,
    endTime: s.endTime,
    mode: s.mode,
    origin: DEMO_ORIGINS[s.originIndex],
  };
  const t0 = Date.now();
  const res = optimizeSchedule(places, settings);
  const ms = Date.now() - t0;

  console.log(`\n=== ${s.id} (${settings.date}, ${s.startTime} 출발, ${s.mode}) · ${ms}ms ===`);
  console.log(`전체 방문 가능: ${res.feasible}`);
  for (const stop of res.stops) {
    console.log(
      `  ${stop.order}. ${stop.place.name.padEnd(16)} 도착 ${formatClock(stop.arrival)} / 이용 ${formatClock(
        stop.start,
      )}~${formatClock(stop.end)} / 이동 ${stop.travelFromPrevMinutes}분 ${
        stop.flags.breakAvoided ? '[브레이크 회피]' : ''
      }${stop.waitMinutes ? `[대기 ${stop.waitMinutes}분]` : ''}${
        stop.flags.unverified ? '[정보 확인 필요]' : ''
      }`,
    );
  }
  for (const ex of res.excluded) console.log(`  ✗ ${ex.place.name}: ${ex.reason} — ${ex.detail}`);
  for (const sg of res.suggestions) console.log(`  → ${sg.title}: ${sg.message}`);
  console.log(
    `  합계: 이동 ${formatDuration(res.totalTravelMinutes)} / ${res.totalDistanceKm.toFixed(
      1,
    )}km, 대기 ${formatDuration(res.totalWaitMinutes)}, 종료 ${formatClock(res.endMinutes)}`,
  );
  if (res.comparison) {
    console.log(
      `  [거리순 비교] ${res.comparison.orderNames.join(' → ')} | 이동 ${formatDuration(
        res.comparison.travelMinutes,
      )}, 대기 ${formatDuration(res.comparison.waitMinutes)}, 충돌 ${res.comparison.conflictCount}건`,
    );
    res.comparison.conflicts.forEach((c) => console.log(`     - ${c}`));
  }
}
