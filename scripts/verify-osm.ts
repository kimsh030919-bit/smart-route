/**
 * OSM opening_hours 파서 + Overpass 실제 조회 검증
 *   npx tsx scripts/verify-osm.ts
 */
import { parseOpeningHours, fetchOsmHours } from '../src/lib/osmHours';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function show(spec: string) {
  const r = parseOpeningHours(spec);
  if (!r) {
    console.log(`  "${spec}"\n    → 해석 불가 (건드리지 않음)`);
    return;
  }
  const lines = r.weekly.map((d, i) =>
    d.closed
      ? `${DAYS[i]}:휴무`
      : `${DAYS[i]}:${d.open}~${d.close}${d.breaks.length ? ` (브레이크 ${d.breaks.map((b) => `${b.start}~${b.end}`).join(',')})` : ''}`,
  );
  console.log(`  "${spec}"\n    → ${lines.join('  ')}`);
}

console.log('── 파서 ──');
[
  '24/7',
  'Mo-Su 11:00-22:00',
  'Mo-Fr 08:00-22:00; Sa-Su 10:00-22:00',
  'Mo-Fr 11:00-15:00, 16:00-20:30; Sa-Su 11:00-20:30',
  'Tu-Su 10:00-19:00; Mo off',
  'Mo-Su 10:00-22:00; PH off',
  'Mo-Fr 09:00-18:00',
  'We-Mo 12:00-21:00; Tu off',
  '11:00-21:00',
  'Mo-Sa 17:00-02:00',
  'Mo-Fr 09:00-18:00; Sa 09:00-13:00; Su off',
  // 해석하면 안 되는 것들
  'Jan-Feb Mo-Su 10:00-18:00',
  'Mo[1] off; Tu-Su 10:00-18:00',
  'sunrise-sunset',
].forEach(show);

console.log('\n── Overpass 실제 조회 (성수동) ──');
const targets = [
  { id: 'a', name: '카페 어니언', lat: 37.5447135, lng: 127.0582322 },
  { id: 'b', name: '대림창고', lat: 37.5418247, lng: 127.0564591 },
  { id: 'c', name: '칙피스', lat: 37.5444446, lng: 127.0529102 },
  { id: 'd', name: '존재하지않는가게이름', lat: 37.5445, lng: 127.0557 },
];

// 전국 확인용 — 서울 밖
const nationwide = [
  { id: 'e', name: '해운대해수욕장', lat: 35.1587, lng: 129.1604 },
  { id: 'f', name: '스타벅스', lat: 35.1595, lng: 129.1606 },
  { id: 'g', name: '전주한옥마을', lat: 35.8150, lng: 127.1530 },
  { id: 'h', name: '제주국제공항', lat: 33.5070, lng: 126.4930 },
];

async function run(label: string, list: typeof targets) {
  const got = await fetchOsmHours(list);
  console.log(`\n[${label}] ${got.size}/${list.length} 매칭`);
  for (const t of list) {
    const m = got.get(t.id);
    if (!m) {
      console.log(`  ✗ ${t.name} — OSM에 영업시간 없음`);
      continue;
    }
    const wd = m.business.weeklyHours!;
    console.log(
      `  ✓ ${t.name} → ${m.osmName} (${m.distanceM}m)  "${m.spec}"` +
        `\n      월: ${wd[1].closed ? '휴무' : `${wd[1].open}~${wd[1].close}`}` +
        `  일: ${wd[0].closed ? '휴무' : `${wd[0].open}~${wd[0].close}`}` +
        `  휴무요일: ${m.business.closedWeekdays.map((i) => DAYS[i]).join(',') || '없음'}` +
        `  브레이크: ${wd[1].breaks.map((b) => `${b.start}~${b.end}`).join(',') || '없음'}`,
    );
  }
}

await run('성수동', targets);
await run('전국(부산/전주/제주)', nationwide);
