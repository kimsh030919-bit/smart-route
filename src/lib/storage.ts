import type { Place, TripSettings } from '../types';
import { todayISO } from './time';

const KEY = 'smart-route:v1';

/** 더 이상 쓰지 않는 예전 저장소 (삭제된 기능이 남긴 것) */
const OBSOLETE_KEYS = ['smart-route:stores:v1'];

export interface PersistedState {
  places: Place[];
  settings: TripSettings;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const MODES = ['walk', 'transit', 'car', 'bike'] as const;

/**
 * 저장된 설정을 검증한다.
 * 손상되거나 지난 날짜가 그대로 복원되면 엉뚱한 요일 기준으로 휴무를 판정하게 되므로
 * 형식이 틀리거나 과거인 값은 안전한 기본값으로 되돌린다.
 */
function normalizeSettings(s: TripSettings): TripSettings {
  const today = todayISO();
  const validDate = typeof s.date === 'string' && DATE_RE.test(s.date) && !Number.isNaN(Date.parse(s.date));
  const date = validDate && s.date >= today ? s.date : today;

  const startTime = TIME_RE.test(s.startTime ?? '') ? s.startTime : '11:00';
  const endTime = TIME_RE.test(s.endTime ?? '') ? s.endTime : '21:00';
  const mode = MODES.includes(s.mode) ? s.mode : 'transit';

  const origin =
    s.origin && Number.isFinite(s.origin.lat) && Number.isFinite(s.origin.lng) ? s.origin : null;

  return { date, startTime, endTime, mode, origin };
}

export function loadState(): PersistedState | null {
  try {
    for (const k of OBSOLETE_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.places) || !parsed.settings) return null;

    parsed.settings = normalizeSettings(parsed.settings);
    // 최소 유효성 검사
    parsed.places = parsed.places.filter(
      (p) =>
        typeof p?.id === 'string' &&
        typeof p?.name === 'string' &&
        Number.isFinite(p?.lat) &&
        Number.isFinite(p?.lng) &&
        !!p?.business &&
        // 예전 버전에서 저장된 가상의 데모 장소는 버린다
        !p.id.startsWith('demo-'),
    );
    // 예전 버전의 데모 출발지도 버린다
    if (parsed.settings.origin && /\(데모\)/.test(parsed.settings.origin.name)) {
      parsed.settings.origin = null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 저장 실패(용량/프라이버시 모드)는 무시 */
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
