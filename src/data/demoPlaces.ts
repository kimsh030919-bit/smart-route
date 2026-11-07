import type { Origin, PlaceSearchResult } from '../types';

/**
 * 데모(샘플) 장소 데이터.
 *
 * ⚠️ 실제 상호/실제 영업정보가 아니다. 알고리즘 시연용으로 만든 가상의 장소이며
 *    이름에 "데모"를 붙여 실제 가게 정보로 오인되지 않게 한다.
 *    (실제 영업정보를 확인할 수 없는 장소는 verified: false 로 두고 "정보 확인 필요"로 표시)
 */

const AREA_SEONGSU = '서울 성동구 성수동 (데모 데이터)';
const AREA_YEONNAM = '서울 마포구 연남동 (데모 데이터)';

export const DEMO_ORIGINS: Origin[] = [
  { name: '성수역 (데모)', address: '서울 성동구 성수동2가', lat: 37.5445, lng: 127.0557 },
  { name: '서울숲 입구 (데모)', address: '서울 성동구 성수동1가', lat: 37.5443, lng: 127.0374 },
  { name: '홍대입구역 (데모)', address: '서울 마포구 동교동', lat: 37.5571, lng: 126.9245 },
];

export const DEMO_PLACES: PlaceSearchResult[] = [
  {
    id: 'demo-cafe-a',
    name: '데모 카페 A',
    category: 'cafe',
    address: `${AREA_SEONGSU} · 성수역 2번 출구`,
    lat: 37.5425,
    lng: 127.057,
    defaultStayMinutes: 70,
    isDemo: true,
    business: {
      verified: true,
      open: '10:00',
      close: '22:00',
      lastOrder: '21:30',
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '데모 데이터 · 루프톱 베이커리 카페',
      source: 'demo',
    },
  },
  {
    id: 'demo-food-b',
    name: '데모 음식점 B',
    category: 'food',
    address: `${AREA_SEONGSU} · 서울숲 인근`,
    lat: 37.544,
    lng: 127.0375,
    defaultStayMinutes: 70,
    isDemo: true,
    business: {
      verified: true,
      open: '11:00',
      close: '21:00',
      lastOrder: '20:00',
      breaks: [{ start: '15:00', end: '17:00' }],
      closedWeekdays: [1],
      temporarilyClosed: false,
      note: '데모 데이터 · 브레이크 타임 시연용 (15:00~17:00 휴게)',
      source: 'demo',
    },
  },
  {
    id: 'demo-attraction-c',
    name: '데모 관광지 C',
    category: 'attraction',
    address: `${AREA_SEONGSU} · 서울숲 전망대`,
    lat: 37.5465,
    lng: 127.0405,
    defaultStayMinutes: 90,
    isDemo: true,
    business: {
      verified: true,
      open: '09:00',
      close: '19:00',
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '데모 데이터 · 입장 마감 18:30',
      source: 'demo',
    },
  },
  {
    id: 'demo-shopping-d',
    name: '데모 쇼핑몰 D',
    category: 'shopping',
    address: `${AREA_SEONGSU} · 성수동 복합몰`,
    lat: 37.5395,
    lng: 127.07,
    defaultStayMinutes: 80,
    isDemo: true,
    business: {
      verified: true,
      open: '10:30',
      close: '22:00',
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '데모 데이터',
      source: 'demo',
    },
  },
  {
    id: 'demo-park-e',
    name: '데모 공원 E',
    category: 'park',
    address: `${AREA_SEONGSU} · 중랑천 산책로`,
    lat: 37.549,
    lng: 127.033,
    defaultStayMinutes: 40,
    isDemo: true,
    business: {
      verified: true,
      open: '05:00',
      close: '23:00',
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '데모 데이터 · 상시 개방',
      source: 'demo',
    },
  },
  {
    id: 'demo-cinema-f',
    name: '데모 영화관 F',
    category: 'cinema',
    address: `${AREA_SEONGSU} · 성수 시네마`,
    lat: 37.5375,
    lng: 127.068,
    defaultStayMinutes: 130,
    isDemo: true,
    business: {
      verified: true,
      open: '10:00',
      close: '23:30',
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '데모 데이터 · 마지막 상영 21:40',
      source: 'demo',
    },
  },
  {
    id: 'demo-food-g',
    name: '데모 분식 G',
    category: 'food',
    address: `${AREA_SEONGSU} · 성수시장 골목`,
    lat: 37.545,
    lng: 127.052,
    defaultStayMinutes: 40,
    isDemo: true,
    business: {
      verified: false,
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '영업정보 미확인 (정보 확인 필요 표시 시연용)',
      source: 'unknown',
    },
  },
  {
    id: 'demo-exhibit-h',
    name: '데모 전시관 H',
    category: 'attraction',
    address: `${AREA_SEONGSU} · 성수동 전시공간`,
    lat: 37.541,
    lng: 127.045,
    defaultStayMinutes: 60,
    isDemo: true,
    business: {
      verified: true,
      open: '10:00',
      close: '18:00',
      breaks: [],
      closedWeekdays: [2],
      temporarilyClosed: true,
      note: '데모 데이터 · 임시 휴무 시연용',
      source: 'demo',
    },
  },
  {
    id: 'demo-cafe-i',
    name: '데모 디저트 카페 I',
    category: 'cafe',
    address: `${AREA_SEONGSU} · 뚝섬로`,
    lat: 37.5478,
    lng: 127.0498,
    defaultStayMinutes: 50,
    isDemo: true,
    business: {
      verified: true,
      open: '12:00',
      close: '20:00',
      lastOrder: '19:30',
      breaks: [{ start: '16:00', end: '16:30' }],
      closedWeekdays: [3],
      temporarilyClosed: false,
      note: '데모 데이터 · 짧은 브레이크 타임 보유',
      source: 'demo',
    },
  },
  {
    id: 'demo-food-j',
    name: '데모 연남 파스타 J',
    category: 'food',
    address: `${AREA_YEONNAM} · 연남동 거리`,
    lat: 37.5618,
    lng: 126.9254,
    defaultStayMinutes: 80,
    isDemo: true,
    business: {
      verified: true,
      open: '11:30',
      close: '22:00',
      lastOrder: '21:00',
      breaks: [{ start: '14:30', end: '17:30' }],
      closedWeekdays: [1],
      temporarilyClosed: false,
      note: '데모 데이터 · 긴 브레이크 타임',
      source: 'demo',
    },
  },
  {
    id: 'demo-park-k',
    name: '데모 연트럴파크 K',
    category: 'park',
    address: `${AREA_YEONNAM} · 경의선숲길`,
    lat: 37.5601,
    lng: 126.9272,
    defaultStayMinutes: 40,
    isDemo: true,
    business: {
      verified: true,
      open: '00:00',
      close: '23:59',
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '데모 데이터 · 상시 개방',
      source: 'demo',
    },
  },
  {
    id: 'demo-shopping-l',
    name: '데모 홍대 쇼핑거리 L',
    category: 'shopping',
    address: `${AREA_YEONNAM} · 홍대 걷고싶은거리`,
    lat: 37.5547,
    lng: 126.9235,
    defaultStayMinutes: 70,
    isDemo: true,
    business: {
      verified: true,
      open: '11:00',
      close: '21:30',
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      note: '데모 데이터',
      source: 'demo',
    },
  },
];

/** 발표용 시나리오 프리셋 */
export interface DemoScenario {
  id: string;
  title: string;
  description: string;
  placeIds: string[];
  originIndex: number;
  startTime: string;
  endTime: string;
  mode: 'walk' | 'transit' | 'car' | 'bike';
  /** 요일 보정: 기준 요일(0=일~6=토). 해당 요일로 가장 가까운 날짜를 자동 선택 */
  weekday: number;
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'breaktime',
    title: '브레이크 타임 때문에 순서가 바뀌는 일정',
    description:
      '11:00 출발 · 카페 A → 음식점 B(15:00~17:00 브레이크) → 관광지 C → 공원 E. 거리순으로 가면 음식점 B에 브레이크 타임 중 도착하지만, SMART ROUTE는 순서를 바꿔 점심 시간대에 배치합니다.',
    placeIds: ['demo-cafe-a', 'demo-food-b', 'demo-attraction-c', 'demo-park-e'],
    originIndex: 0,
    startTime: '11:00',
    endTime: '21:00',
    mode: 'transit',
    weekday: 6,
  },
  {
    id: 'holiday',
    title: '정기 휴무 · 임시 휴무로 헛걸음하는 일정',
    description:
      '월요일 출발 · 음식점 B(월요일 휴무)와 전시관 H(임시 휴무)가 포함된 구성. 헛걸음할 장소를 미리 걸러내고 대안을 제시합니다.',
    placeIds: ['demo-cafe-a', 'demo-food-b', 'demo-exhibit-h', 'demo-shopping-d'],
    originIndex: 0,
    startTime: '10:30',
    endTime: '20:00',
    mode: 'car',
    weekday: 1,
  },
  {
    id: 'fullday',
    title: '하루 꽉 채운 6곳 일정',
    description:
      '09:30 출발 · 공원/관광지/음식점/카페/쇼핑몰/영화관 6곳. 영업시간·라스트오더·체류시간을 모두 고려해 하루 타임라인을 만듭니다.',
    placeIds: [
      'demo-park-e',
      'demo-attraction-c',
      'demo-food-b',
      'demo-cafe-i',
      'demo-shopping-d',
      'demo-cinema-f',
    ],
    originIndex: 1,
    startTime: '09:30',
    endTime: '23:00',
    mode: 'transit',
    weekday: 6,
  },
];

/** 기준 요일에 해당하는 가장 가까운 미래(또는 오늘) 날짜 "YYYY-MM-DD" */
export function nextDateForWeekday(weekday: number): string {
  const d = new Date();
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 데모 장소 검색 (이름/주소/카테고리 문자열 포함 검색) */
export function searchDemoPlaces(keyword: string): PlaceSearchResult[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return DEMO_PLACES;
  return DEMO_PLACES.filter((p) => {
    const haystack = `${p.name} ${p.address} ${p.category} ${p.business.note ?? ''}`.toLowerCase();
    return haystack.includes(q);
  });
}
