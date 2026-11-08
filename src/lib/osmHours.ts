import type { BusinessInfo, DayHours, TimeRange } from '../types';

/**
 * OpenStreetMap(Overpass API) 영업시간 연동 — **API 키가 필요 없는 실제 지도 영업시간**
 *
 * 왜 이걸 쓰는가
 *  - 브이월드·카카오 키워드 검색은 영업시간 필드를 응답에 담지 않는다.
 *  - 구글 Places 는 영업시간을 주지만 결제 계정이 연결된 API 키가 필요하다.
 *  - OSM 은 키가 필요 없고, CORS 가 열려 있으며(Access-Control-Allow-Origin: *),
 *    전 세계(= 전국) 어디든 같은 방식으로 조회된다.
 *
 * 정직성
 *  - OSM 에 `opening_hours` 태그가 **등록된 장소만** 값을 채운다. 없으면 건드리지 않는다.
 *    (추측해서 만들어 내지 않는다. 그런 장소는 기존대로 업종 추정값/미확인으로 남는다)
 *  - 커버리지는 지역·업종마다 다르다. 서울 주요 상권은 꽤 채워져 있고, 소규모 매장은 비어 있을 수 있다.
 *  - 커뮤니티가 입력한 데이터라 최신이 아닐 수 있다. 태그에 `check_date` 가 있으면 함께 보관한다.
 *  - 라스트 오더는 OSM 에도 없다. 사용자가 직접 입력해야 한다.
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/**
 * 공개 Overpass 서버는 자주 혼잡하다(429/502/503 — "All query workers are busy").
 * 서버 안내대로 지수적으로 간격을 늘려 재시도하고, 과하게 두드리지 않는다.
 */
const RETRY_DELAYS_MS = [0, 4000];

/** 미러 한 곳이 느릴 때 기다릴 최대 시간(ms) */
const ENDPOINT_TIMEOUT_MS = 9000;

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (ms === 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

/** 검색 반경(m) — 좌표 출처(브이월드/카카오/구글)가 달라 약간의 오차를 허용한다 */
const RADIUS_M = 220;

/** 이름 표기가 다를 때(느슨한 일치) 인정하는 최대 거리(m) */
const LOOSE_RADIUS_M = 120;

const DAY_INDEX: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

const HHMM = /^(\d{1,2}):(\d{2})$/;

const pad = (n: number): string => String(n).padStart(2, '0');
const fromMin = (m: number): string => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

function toMin(hhmm: string): number | null {
  const m = HHMM.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59 || h > 48) return null;
  return h * 60 + min;
}

export interface ParsedHours {
  /** 길이 7 (0=일 ~ 6=토) */
  weekly: DayHours[];
  /** 자정을 넘기는 영업시간을 23:59 로 잘라 낸 요일이 있는지 */
  truncatedOvernight: boolean;
}

/**
 * OSM `opening_hours` 문자열을 요일별 영업시간으로 변환한다.
 *
 * 지원하는 형태 (한국 데이터에서 실제로 쓰이는 범위)
 *   "24/7"
 *   "Mo-Su 11:00-22:00"
 *   "Mo-Fr 08:00-22:00; Sa-Su 10:00-22:00"
 *   "Mo-Fr 11:00-15:00,16:00-20:30; Sa-Su 11:00-20:30"   ← 구간 사이가 브레이크 타임
 *   "Tu-Su 10:00-19:00; Mo off"
 *   "Mo-Su 10:00-22:00; PH off"                           ← 공휴일 규칙은 무시
 *
 * 월/주 단위 선택자("Jan-Feb", "week 1-3", "Apr 01"), 요일 n번째("Mo[1]"),
 * 일출/일몰("sunset") 등 복잡한 문법이 섞이면 **해석하지 않고 null 을 돌려준다.**
 * 잘못 읽어서 틀린 영업시간을 만드는 것보다 "정보 없음"이 낫다.
 */
export function parseOpeningHours(spec: string): ParsedHours | null {
  const raw = spec.trim();
  if (!raw) return null;

  const weekly: DayHours[] = Array.from({ length: 7 }, () => ({ closed: true, breaks: [] }));

  if (/^24\s*\/\s*7$/.test(raw)) {
    return {
      weekly: weekly.map(() => ({ closed: false, open: '00:00', close: '23:59', breaks: [] })),
      truncatedOvernight: false,
    };
  }

  // 해석할 수 없는 문법이 보이면 통째로 포기한다
  if (/sunrise|sunset|dawn|dusk|week\s|\[|easter|"/i.test(raw)) return null;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(raw)) return null;

  let touched = false;
  let truncatedOvernight = false;

  for (const rule of raw.split(';')) {
    const text = rule.trim();
    if (!text) continue;
    // 공휴일/학기 등 요일 외 선택자는 건너뛴다
    if (/^(ph|sh)\b/i.test(text)) continue;

    // 선두의 요일 선택자를 떼어 낸다
    const m = /^((?:(?:mo|tu|we|th|fr|sa|su)(?:\s*-\s*(?:mo|tu|we|th|fr|sa|su))?\s*,?\s*)+)(.*)$/i.exec(
      text,
    );

    let days: number[];
    let rest: string;

    if (m) {
      days = expandDays(m[1]);
      rest = m[2].trim();
    } else if (HHMM.test(text.split(/[-,\s]/)[0] ?? '')) {
      // 요일 없이 시간만 → 매일
      days = [0, 1, 2, 3, 4, 5, 6];
      rest = text;
    } else {
      return null; // 알 수 없는 선택자
    }

    if (days.length === 0) return null;

    if (/^(off|closed)$/i.test(rest)) {
      for (const d of days) weekly[d] = { closed: true, breaks: [] };
      touched = true;
      continue;
    }

    const ranges: { start: number; end: number }[] = [];
    for (const part of rest.split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      const pair = seg.split('-');
      if (pair.length !== 2) return null;
      const start = toMin(pair[0]);
      let end = toMin(pair[1]);
      if (start === null || end === null) return null;
      if (end === 24 * 60) end = 24 * 60 - 1;
      // "10:00-10:00" 처럼 길이가 0인 구간은 잘못 입력된 데이터다. 추측하지 않고 포기한다.
      if (end === start) return null;
      if (end < start) {
        // 자정을 넘기는 영업 (예: 17:00-02:00) — 하루 단위 스케줄러에 맞게 23:59 로 자른다
        end = 24 * 60 - 1;
        truncatedOvernight = true;
      }
      ranges.push({ start, end });
    }
    if (ranges.length === 0) return null;

    ranges.sort((a, b) => a.start - b.start);
    const breaks: TimeRange[] = [];
    for (let i = 1; i < ranges.length; i += 1) {
      const gapStart = ranges[i - 1].end;
      const gapEnd = ranges[i].start;
      if (gapEnd > gapStart) breaks.push({ start: fromMin(gapStart), end: fromMin(gapEnd) });
    }

    const day: DayHours = {
      closed: false,
      open: fromMin(ranges[0].start),
      close: fromMin(ranges[ranges.length - 1].end),
      breaks,
    };
    for (const d of days) weekly[d] = { ...day, breaks: breaks.map((b) => ({ ...b })) };
    touched = true;
  }

  if (!touched) return null;
  if (weekly.every((d) => d.closed)) return null; // 전 요일 휴무 = 해석 실패로 본다

  return { weekly, truncatedOvernight };
}

/** "Mo-Fr, Su" → [1,2,3,4,5,0] */
function expandDays(selector: string): number[] {
  const out = new Set<number>();
  for (const token of selector.split(',')) {
    const t = token.trim().toLowerCase();
    if (!t) continue;
    const range = t.split('-').map((s) => s.trim());
    if (range.length === 1) {
      const d = DAY_INDEX[range[0]];
      if (d === undefined) return [];
      out.add(d);
    } else if (range.length === 2) {
      const a = DAY_INDEX[range[0]];
      const b = DAY_INDEX[range[1]];
      if (a === undefined || b === undefined) return [];
      // Mo-Su 처럼 주를 감싸는 경우도 처리
      for (let i = 0; i < 7; i += 1) {
        const d = (a + i) % 7;
        out.add(d);
        if (d === b) break;
      }
    } else {
      return [];
    }
  }
  return [...out];
}

// ─────────────────────────────────────────────────────────────
// Overpass 조회
// ─────────────────────────────────────────────────────────────

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OsmQueryTarget {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface OsmHoursMatch {
  /** 매칭된 OSM 객체 이름 */
  osmName: string;
  /** 원본 opening_hours 태그 */
  spec: string;
  distanceM: number;
  /** 마지막 확인 날짜 (OSM check_date 태그, 있는 경우) */
  checkDate?: string;
  /** 상호 표기가 달라 "부분 일치"로 찾은 경우 (사용자 확인 권장) */
  looseMatch: boolean;
  business: BusinessInfo;
}

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 상호 비교용 정규화: 공백/괄호/지점명 제거 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[\s·・,.'"-]/g, '')
    .replace(/(본점|직영점|지점|점)$/u, '');
}

/** 두 문자열의 가장 긴 공통 부분문자열 길이 */
function longestCommonSubstring(x: string, y: string): number {
  let best = 0;
  let prev = new Array<number>(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i += 1) {
    const cur = new Array<number>(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j += 1) {
      if (x[i - 1] === y[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/** 지명에 흔히 붙어 우연히 겹치기 쉬운 토막 — 이것만 겹치는 건 매칭으로 치지 않는다 */
const GENERIC_FRAGMENTS = [
  '서울', '성수', '강남', '홍대', '명동', '부산', '대구', '광주', '대전', '인천', '제주',
  '커피', '카페', '식당', '공원', '마을', '센터', '회사', '컴퍼니', '코리아', '스토어',
];

/**
 * 상호 매칭.
 *  - strict : 완전일치 또는 포함관계 (예: "칙피스" ⊂ "칙피스 성수점")
 *  - loose  : 3글자 이상 공통 부분문자열 (예: "어니언컴퍼니성수점" ↔ "카페 어니언" → "어니언")
 *             표기가 다른 경우를 잡되, 흔한 지명·업종 토막만 겹치는 건 제외한다.
 */
function namesMatch(a: string, b: string): 'strict' | 'loose' | null {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (x.length < 2 || y.length < 2) return null;
  if (x === y || x.includes(y) || y.includes(x)) return 'strict';

  const lcsLen = longestCommonSubstring(x, y);
  if (lcsLen < 3) return null;
  // 공통 부분이 흔한 토막뿐이면 우연의 일치로 본다
  const common = findCommonFragment(x, y, lcsLen);
  if (common && GENERIC_FRAGMENTS.includes(common)) return null;
  return 'loose';
}

function findCommonFragment(x: string, y: string, len: number): string | null {
  for (let i = 0; i + len <= x.length; i += 1) {
    const frag = x.slice(i, i + len);
    if (y.includes(frag)) return frag;
  }
  return null;
}

function buildQuery(targets: OsmQueryTarget[]): string {
  const clauses = targets
    .map(
      (t) =>
        `nwr(around:${RADIUS_M},${t.lat.toFixed(6)},${t.lng.toFixed(6)})["opening_hours"];`,
    )
    .join('\n  ');
  return `[out:json][timeout:30];\n(\n  ${clauses}\n);\nout tags center 400;`;
}

function toBusinessInfo(
  parsed: ParsedHours,
  spec: string,
  checkDate: string | undefined,
  matchedName?: string,
): BusinessInfo {
  const weeklyHours = parsed.weekly.map((d) => ({ ...d, breaks: d.breaks.map((b) => ({ ...b })) }));
  const firstOpen = weeklyHours.find((d) => !d.closed);
  const closedWeekdays = weeklyHours.map((d, i) => (d.closed ? i : -1)).filter((i) => i >= 0);

  const notes = [`OpenStreetMap 영업시간 (${spec})`];
  if (matchedName) notes.push(`상호 표기가 달라 "${matchedName}" 으로 매칭했습니다 — 확인해 주세요`);
  if (checkDate) notes.push(`최종 확인 ${checkDate}`);
  if (parsed.truncatedOvernight) notes.push('자정을 넘기는 영업시간은 23:59로 계산합니다');
  notes.push('라스트 오더는 제공되지 않아 직접 입력해야 합니다');

  return {
    verified: true,
    open: firstOpen?.open,
    close: firstOpen?.close,
    breaks: firstOpen?.breaks.map((b) => ({ ...b })) ?? [],
    closedWeekdays,
    weeklyHours,
    temporarilyClosed: false,
    note: notes.join(' · '),
    source: 'osm',
  };
}

/**
 * 여러 장소의 영업시간을 Overpass 한 번의 호출로 조회한다.
 * 이름이 비슷하고 반경 안에 있는 OSM 객체를 매칭하며, 없으면 그 장소는 결과에 담기지 않는다.
 */
export async function fetchOsmHours(
  targets: OsmQueryTarget[],
  signal?: AbortSignal,
): Promise<Map<string, OsmHoursMatch>> {
  const out = new Map<string, OsmHoursMatch>();
  if (targets.length === 0) return out;

  const query = buildQuery(targets);
  let elements: OverpassElement[] | null = null;
  let lastError = '';

  /** 한 엔드포인트에 질의한다. 실패하면 거부(reject)해서 Promise.any 가 다음 후보를 쓰게 한다. */
  const ask = async (endpoint: string): Promise<OverpassElement[]> => {
    // 미러 하나가 응답하지 않을 때 전체가 멈추지 않도록 엔드포인트마다 제한시간을 둔다
    const timeout = AbortSignal.timeout(ENDPOINT_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }).toString(),
      signal: combined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { elements?: OverpassElement[] };
    return json.elements ?? [];
  };

  // 공개 Overpass 미러는 수시로 503/429 를 돌려준다.
  // 순서대로 기다리면 한 번의 조회가 1분 가까이 걸릴 수 있으므로
  // 미러들에 동시에 묻고 **먼저 성공한 응답**을 쓴다.
  for (const delay of RETRY_DELAYS_MS) {
    await sleep(delay, signal);
    try {
      elements = await Promise.any(ENDPOINTS.map(ask));
      break;
    } catch (e) {
      if (signal?.aborted) throw e;
      const errors = e instanceof AggregateError ? e.errors : [e];
      lastError = errors
        .map((x) => (x instanceof Error ? x.message : String(x)))
        .join(', ');
    }
  }

  if (elements === null) {
    throw new Error(
      /429|50[23]|TimeoutError|timed out/.test(lastError)
        ? 'OpenStreetMap 영업시간 서버가 혼잡합니다(무료 공개 서버). 잠시 후 다시 시도해 주세요.'
        : `OpenStreetMap 영업시간 서버에 연결하지 못했습니다. (${lastError || '알 수 없는 오류'})`,
    );
  }

  for (const target of targets) {
    // 정확한 이름 일치를 느슨한 일치보다 항상 우선한다
    let best: { el: OverpassElement; dist: number; rank: number } | null = null;

    for (const el of elements) {
      const tags = el.tags;
      if (!tags?.opening_hours) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat === undefined || lon === undefined) continue;

      const dist = haversineM(target.lat, target.lng, lat, lon);
      if (dist > RADIUS_M) continue;

      const candidates = [tags.name, tags['name:ko'], tags['name:en'], tags.brand, tags['brand:ko']];
      let quality: 'strict' | 'loose' | null = null;
      for (const c of candidates) {
        if (!c) continue;
        const q = namesMatch(target.name, c);
        if (q === 'strict') {
          quality = 'strict';
          break;
        }
        if (q === 'loose') quality = 'loose';
      }
      if (!quality) continue;
      // 느슨한 일치는 아주 가까울 때만 인정한다 (엉뚱한 가게를 집지 않도록)
      if (quality === 'loose' && dist > LOOSE_RADIUS_M) continue;

      const rank = quality === 'strict' ? 0 : 1;
      if (!best || rank < best.rank || (rank === best.rank && dist < best.dist)) {
        best = { el, dist, rank };
      }
    }

    if (!best) continue;
    const tags = best.el.tags!;
    const parsed = parseOpeningHours(tags.opening_hours);
    if (!parsed) continue; // 해석 못 하는 문법 → 건드리지 않는다

    const osmName = tags.name ?? tags['name:ko'] ?? target.name;
    const looseMatch = best.rank === 1;
    const checkDate = tags.check_date ?? tags['survey:date'];

    out.set(target.id, {
      osmName,
      spec: tags.opening_hours,
      distanceM: Math.round(best.dist),
      checkDate,
      looseMatch,
      business: toBusinessInfo(
        parsed,
        tags.opening_hours,
        checkDate,
        looseMatch ? osmName : undefined,
      ),
    });
  }

  return out;
}
