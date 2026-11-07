import type { BusinessInfo, ExclusionReason, Place, TimeRange } from '../types';
import { WEEKDAY_LABELS, overlaps, toHHMM, toMinutes } from './time';

export interface MinuteRange {
  start: number;
  end: number;
}

/** 영업정보가 "확인된" 상태인지 (영업 시작/종료가 모두 있어야 제약으로 사용) */
export function hasVerifiedHours(info: BusinessInfo): boolean {
  return info.verified && toMinutes(info.open) !== null && toMinutes(info.close) !== null;
}

export function breakRanges(info: BusinessInfo): MinuteRange[] {
  const out: MinuteRange[] = [];
  for (const b of info.breaks) {
    const s = toMinutes(b.start);
    const e = toMinutes(b.end);
    if (s === null || e === null || e <= s) continue;
    out.push({ start: s, end: e });
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * 해당 요일에 방문 가능한 시간창 목록.
 * - 정기 휴무 / 임시 휴무 -> 빈 배열
 * - 영업정보 미확인 -> null (제약 없음. 임의로 영업시간을 만들어 내지 않고 UI에 "정보 확인 필요" 표시)
 */
export function openWindows(info: BusinessInfo, weekday: number): MinuteRange[] | null {
  if (info.temporarilyClosed) return [];
  if (info.closedWeekdays.includes(weekday)) return [];
  if (!hasVerifiedHours(info)) return null;

  const open = toMinutes(info.open)!;
  const close = toMinutes(info.close)!;
  if (close <= open) return [];

  let windows: MinuteRange[] = [{ start: open, end: close }];
  for (const br of breakRanges(info)) {
    const next: MinuteRange[] = [];
    for (const w of windows) {
      if (!overlaps(w.start, w.end, br.start, br.end)) {
        next.push(w);
        continue;
      }
      if (br.start > w.start) next.push({ start: w.start, end: Math.min(br.start, w.end) });
      if (br.end < w.end) next.push({ start: Math.max(br.end, w.start), end: w.end });
    }
    windows = next;
  }
  return windows.filter((w) => w.end > w.start);
}

/** 반복 계산을 위해 미리 해석해 둔 시간 제약 */
export interface Compiled {
  place: Place;
  stay: number;
  /** null = 영업정보 미확인(제약 없음) */
  windows: MinuteRange[] | null;
  open: number | null;
  close: number | null;
  lastOrder: number | null;
  breaks: MinuteRange[];
  /** 날짜만으로 이미 방문 불가인 경우 */
  staticFail: { reason: ExclusionReason; detail: string } | null;
}

export function compileConstraint(place: Place, weekday: number): Compiled {
  const info = place.business;
  const stay = Math.max(5, place.stayMinutes);
  const base: Compiled = {
    place,
    stay,
    windows: null,
    open: toMinutes(info.open),
    close: toMinutes(info.close),
    lastOrder: toMinutes(info.lastOrder),
    breaks: breakRanges(info),
    staticFail: null,
  };

  if (info.temporarilyClosed) {
    return {
      ...base,
      windows: [],
      staticFail: { reason: 'temporarily_closed', detail: '임시 휴무로 등록된 장소입니다.' },
    };
  }
  if (info.closedWeekdays.includes(weekday)) {
    return {
      ...base,
      windows: [],
      staticFail: {
        reason: 'closed_weekday',
        detail: `${WEEKDAY_LABELS[weekday]}요일은 정기 휴무입니다.`,
      },
    };
  }

  const windows = openWindows(info, weekday);
  if (windows !== null && windows.length === 0) {
    return {
      ...base,
      windows,
      staticFail: {
        reason: 'closed_weekday',
        detail: '입력된 영업시간으로는 해당 날짜에 방문할 수 있는 시간이 없습니다.',
      },
    };
  }
  if (windows !== null && !windows.some((w) => w.end - w.start >= stay)) {
    return {
      ...base,
      windows,
      staticFail: {
        reason: 'stay_too_long',
        detail: `체류시간 ${stay}분을 담을 수 있는 영업 구간이 없습니다. (브레이크 타임으로 영업시간이 나뉘어 있을 수 있어요)`,
      },
    };
  }
  return { ...base, windows };
}

export interface SlotResult {
  ok: boolean;
  start?: number;
  end?: number;
  waitMinutes?: number;
  breakAvoided?: boolean;
  waitedForOpen?: boolean;
  nearLastOrder?: boolean;
  nearClose?: boolean;
  reason?: ExclusionReason;
  detail?: string;
}

/**
 * 도착시각(arrival)에 체류시간을 소화할 수 있는 가장 빠른 시작 시각을 찾는다.
 * - 영업 시작 전 도착 -> 오픈까지 대기
 * - 브레이크 타임과 겹침 -> 브레이크 종료 후로 이동
 * - 라스트 오더 이후 시작 불가
 */
export function slotFor(c: Compiled, arrival: number): SlotResult {
  if (c.staticFail) return { ok: false, ...c.staticFail };

  // 영업정보 미확인 -> 시간 제약 없이 배치
  if (c.windows === null) {
    return {
      ok: true,
      start: arrival,
      end: arrival + c.stay,
      waitMinutes: 0,
      waitedForOpen: false,
      breakAvoided: false,
      nearLastOrder: false,
      nearClose: false,
    };
  }

  for (const w of c.windows) {
    const start = Math.max(arrival, w.start);
    if (start + c.stay > w.end) continue;
    if (c.lastOrder !== null && start > c.lastOrder) {
      return {
        ok: false,
        reason: 'after_last_order',
        detail: `라스트 오더 ${toHHMM(c.lastOrder)} 이후에 도착하게 됩니다.`,
      };
    }
    const end = start + c.stay;
    return {
      ok: true,
      start,
      end,
      waitMinutes: start - arrival,
      waitedForOpen: c.open !== null && arrival < c.open,
      breakAvoided: c.breaks.some((b) => arrival < b.end && start >= b.end),
      nearLastOrder: c.lastOrder !== null && c.lastOrder - start <= 30,
      nearClose: c.close !== null && c.close - end <= 30,
    };
  }

  if (c.close !== null && arrival >= c.close) {
    return {
      ok: false,
      reason: 'arrive_after_close',
      detail: `영업 종료 ${toHHMM(c.close)} 이후에 도착하게 됩니다.`,
    };
  }
  const hit = c.breaks.find((b) => overlaps(arrival, arrival + c.stay, b.start, b.end));
  if (hit) {
    return {
      ok: false,
      reason: 'break_conflict',
      detail: `브레이크 타임 ${toHHMM(hit.start)}~${toHHMM(hit.end)}과 겹치고, 그 이후에는 체류시간 ${c.stay}분을 확보할 수 없습니다.`,
    };
  }
  return {
    ok: false,
    reason: 'stay_too_long',
    detail: `도착 시각 기준으로 체류시간 ${c.stay}분을 확보할 수 없습니다.`,
  };
}

/** 단건 확인용 */
export function findSlot(place: Place, arrival: number, weekday: number): SlotResult {
  return slotFor(compileConstraint(place, weekday), arrival);
}

export function formatRange(r: TimeRange): string {
  return `${r.start}~${r.end}`;
}

export function hoursSummary(info: BusinessInfo): string {
  if (info.temporarilyClosed) return '임시 휴무';
  if (!hasVerifiedHours(info)) return '정보 확인 필요';
  return `${info.open}~${info.close}`;
}

export function closedDaysSummary(info: BusinessInfo): string {
  if (!info.verified) return '정보 확인 필요';
  if (info.closedWeekdays.length === 0) return '정기 휴무 없음';
  return `${info.closedWeekdays.map((d) => WEEKDAY_LABELS[d]).join('·')}요일 휴무`;
}

export function breaksSummary(info: BusinessInfo): string {
  if (!info.verified) return '정보 확인 필요';
  if (info.breaks.length === 0) return '없음';
  return info.breaks.map(formatRange).join(', ');
}

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  closed_weekday: '정기 휴무',
  temporarily_closed: '임시 휴무',
  arrive_after_close: '영업 종료 후 도착',
  break_conflict: '브레이크 타임 충돌',
  stay_too_long: '체류시간 확보 불가',
  after_last_order: '라스트 오더 경과',
  over_end_time: '희망 종료 시간 초과',
  unreachable: '동선 구성 불가',
};
