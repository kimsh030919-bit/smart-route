/** "HH:MM" -> 분. 잘못된 값이면 null */
export function toMinutes(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min) || min > 59) return null;
  return h * 60 + min;
}

/** 분 -> "HH:MM" (24시 이상은 다음날로 환산해 표기) */
export function toHHMM(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 사람이 읽는 시각 표기. 24:00 이후는 "익일 01:00" */
export function formatClock(minutes: number): string {
  if (minutes >= 24 * 60) return `익일 ${toHHMM(minutes - 24 * 60)}`;
  return toHHMM(minutes);
}

/** 분 -> "1시간 20분" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}시간` : `${h}시간 ${rest}분`;
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** "YYYY-MM-DD" -> 0(일)~6(토). 잘못된 값이면 null */
export function weekdayOf(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

export function formatDateKo(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const wd = weekdayOf(dateStr);
  if (!m || wd === null) return dateStr;
  return `${Number(m[2])}월 ${Number(m[3])}일 (${WEEKDAY_LABELS[wd]})`;
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 두 구간이 겹치는지 (닫힌-열린 구간 [aS, aE) ) */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
