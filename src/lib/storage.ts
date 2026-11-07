import type { Place, TripSettings } from '../types';

const KEY = 'smart-route:v1';

export interface PersistedState {
  places: Place[];
  settings: TripSettings;
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.places) || !parsed.settings) return null;
    // 최소 유효성 검사
    parsed.places = parsed.places.filter(
      (p) =>
        typeof p?.id === 'string' &&
        typeof p?.name === 'string' &&
        Number.isFinite(p?.lat) &&
        Number.isFinite(p?.lng) &&
        !!p?.business,
    );
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
