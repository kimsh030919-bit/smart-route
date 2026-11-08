import type { BusinessInfo, Category, DayHours, Origin, PlaceSearchResult, TimeRange } from '../types';
import { CATEGORY_META } from '../data/categories';

/**
 * 구글 지도(Places API New) 연동 — **실제 영업시간을 제공하는 유일한 경로**
 *
 * 브이월드·카카오 키워드 검색은 영업시간 필드를 응답에 담지 않는다.
 * 지도 앱 화면에 보이는 영업시간을 쓰려면 영업시간을 실제로 제공하는 API가 필요하고,
 * 국내 장소까지 커버하는 공개 API는 Google Places 가 사실상 유일하다.
 *
 * 받아오는 것
 *  - regularOpeningHours.periods → **요일별 영업시간**으로 변환
 *  - 같은 요일에 구간이 둘 이상이면 그 사이를 **브레이크 타임**으로 변환
 *    (예: 11:00~15:00 + 17:00~21:00 → 브레이크 15:00~17:00)
 *
 * 받아오지 못하는 것
 *  - 라스트 오더: 구글이 제공하지 않는다 (사용자가 직접 입력)
 *  - 임시 휴무: 특정 날짜 휴무는 제공되지 않는다
 *
 * 설정: .env 에 VITE_GOOGLE_PLACES_KEY (Google Cloud → Places API (New) 사용 설정 + 결제 계정 필요)
 */

export const GOOGLE_PLACES_KEY: string = (
  import.meta.env.VITE_GOOGLE_PLACES_KEY ?? ''
).trim();

export function hasGoogleKey(): boolean {
  return GOOGLE_PLACES_KEY.length > 0;
}

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.regularOpeningHours',
  'places.businessStatus',
].join(',');

interface GooglePoint {
  day: number; // 0=일 ~ 6=토
  hour: number;
  minute: number;
}

interface GooglePeriod {
  open: GooglePoint;
  close?: GooglePoint;
}

interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  regularOpeningHours?: { periods?: GooglePeriod[] };
}

const toMin = (p: GooglePoint): number => p.hour * 60 + p.minute;

/** 분 → "HH:MM" */
const fromMin = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 구글 types → 내부 카테고리 */
function categoryFromGoogle(primary: string | undefined, types: string[] = []): Category {
  const all = [primary, ...types].filter(Boolean).join(' ');
  if (/cafe|coffee_shop|bakery|dessert|tea_house|ice_cream/.test(all)) return 'cafe';
  if (/restaurant|food|meal_takeaway|bar|pub|diner|steak|pizza|chicken/.test(all)) return 'food';
  if (/park|hiking|campground|beach/.test(all)) return 'park';
  if (/movie_theater|cinema/.test(all)) return 'cinema';
  if (/shopping_mall|department_store|supermarket|store|market|convenience/.test(all))
    return 'shopping';
  if (/tourist_attraction|museum|art_gallery|historical|landmark|zoo|aquarium|temple|church/.test(all))
    return 'attraction';
  return 'etc';
}

/**
 * 구글 periods → 요일별 영업시간 + 브레이크 타임
 * 같은 요일 구간이 여러 개면 구간 사이를 브레이크로 본다.
 */
function toWeeklyHours(periods: GooglePeriod[]): (DayHours | null)[] {
  // 요일별로 구간 모으기
  const byDay: { start: number; end: number }[][] = Array.from({ length: 7 }, () => []);

  for (const p of periods) {
    if (!p.open) continue;
    const day = p.open.day;
    if (day < 0 || day > 6) continue;
    const start = toMin(p.open);
    // close 가 없으면 24시간 영업
    const end = p.close ? (p.close.day === day ? toMin(p.close) : 24 * 60 - 1) : 24 * 60 - 1;
    byDay[day].push({ start, end: end > start ? end : 24 * 60 - 1 });
  }

  return byDay.map((ranges) => {
    if (ranges.length === 0) return { closed: true, breaks: [] };
    ranges.sort((a, b) => a.start - b.start);

    const open = ranges[0].start;
    const close = ranges[ranges.length - 1].end;
    const breaks: TimeRange[] = [];
    for (let i = 1; i < ranges.length; i += 1) {
      const gapStart = ranges[i - 1].end;
      const gapEnd = ranges[i].start;
      if (gapEnd > gapStart) {
        breaks.push({ start: fromMin(gapStart), end: fromMin(gapEnd) });
      }
    }

    return {
      closed: false,
      open: fromMin(open),
      close: fromMin(close),
      breaks,
    };
  });
}

function toBusinessInfo(place: GooglePlace): BusinessInfo {
  const periods = place.regularOpeningHours?.periods ?? [];
  const permanentlyClosed = place.businessStatus === 'CLOSED_PERMANENTLY';
  const temporarilyClosed = place.businessStatus === 'CLOSED_TEMPORARILY' || permanentlyClosed;

  if (periods.length === 0) {
    // 구글에도 영업시간이 없는 장소 — 추측하지 않는다 (추정값 로직이 뒤에서 채운다)
    return {
      verified: false,
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed,
      note: permanentlyClosed
        ? '구글 지도 기준 영구 폐업으로 표시된 장소입니다.'
        : '구글 지도에 영업시간이 등록되어 있지 않습니다.',
      source: 'unknown',
    };
  }

  const weeklyHours = toWeeklyHours(periods);
  // 대표 영업시간: 문을 여는 요일 중 첫 번째를 기본값으로
  const firstOpen = weeklyHours.find((d) => d && !d.closed) ?? null;
  const closedWeekdays = weeklyHours
    .map((d, i) => (d?.closed ? i : -1))
    .filter((i) => i >= 0);

  return {
    verified: true,
    open: firstOpen?.open,
    close: firstOpen?.close,
    breaks: firstOpen?.breaks.map((b) => ({ ...b })) ?? [],
    closedWeekdays,
    weeklyHours,
    temporarilyClosed,
    note: '구글 지도 영업시간 (라스트 오더·임시 휴무는 제공되지 않습니다)',
    source: 'google',
  };
}

/** 구글 지도에서 장소를 검색한다. 실패하면 예외를 던진다. */
export async function searchGooglePlaces(
  keyword: string,
  origin?: Origin | null,
): Promise<PlaceSearchResult[]> {
  const body: Record<string, unknown> = {
    textQuery: keyword,
    languageCode: 'ko',
    regionCode: 'KR',
    maxResultCount: 20,
  };
  if (origin) {
    body.locationBias = {
      circle: {
        center: { latitude: origin.lat, longitude: origin.lng },
        radius: 20000,
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(
      '구글 Places 호출에 실패했습니다. 네트워크 또는 브라우저 차단(CORS)을 확인해 주세요.',
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `구글 Places 응답 오류 (${res.status}). API 키 제한(HTTP 리퍼러)과 Places API (New) 사용 설정을 확인해 주세요. ${text.slice(0, 120)}`,
    );
  }

  const json = (await res.json()) as { places?: GooglePlace[] };
  const places = json.places ?? [];

  return places
    .filter((p) => p.location)
    .map((p) => {
      const category = categoryFromGoogle(p.primaryType, p.types);
      return {
        id: `google-${p.id}`,
        name: p.displayName?.text ?? '이름 없는 장소',
        category,
        address: p.formattedAddress ?? '주소 정보 없음',
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        defaultStayMinutes: CATEGORY_META[category].defaultStay,
        business: toBusinessInfo(p),
      } satisfies PlaceSearchResult;
    });
}
