import type { Store } from '../types';
import { STORE_SEED } from '../data/storeSeed';

/**
 * 가게 데이터베이스 (브라우저 LocalStorage).
 *
 * 서버 DB가 없는 프로토타입이므로 LocalStorage를 저장소로 쓴다.
 * - 최초 실행 시 시드 데이터를 넣는다.
 * - 관리자 페이지의 등록/수정/삭제/일괄 업로드가 모두 이 모듈을 거친다.
 * - JSON 내보내기/가져오기로 백업·이관이 가능하다. (서버 전환 시 이 모듈만 교체하면 된다)
 */

const KEY = 'smart-route:stores:v1';

type Listener = (stores: Store[]) => void;
const listeners = new Set<Listener>();

function read(): Store[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isValidStore);
  } catch {
    return null;
  }
}

function write(stores: Store[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stores));
  } catch {
    /* 저장 실패(용량/프라이버시 모드)는 무시 */
  }
  listeners.forEach((fn) => fn(stores));
}

function isValidStore(s: unknown): s is Store {
  const v = s as Store;
  return (
    !!v &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lng) &&
    !!v.business
  );
}

/** 전체 가게 목록 (최초 호출 시 시드 적재) */
export function getStores(): Store[] {
  const stored = read();
  if (stored && stored.length > 0) return stored;
  write(STORE_SEED);
  return STORE_SEED;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStore(id: string): Store | undefined {
  return getStores().find((s) => s.id === id);
}

export function upsertStore(store: Store): Store[] {
  const stores = getStores();
  const idx = stores.findIndex((s) => s.id === store.id);
  const next = [...stores];
  const stamped: Store = { ...store, updatedAt: new Date().toISOString() };
  if (idx >= 0) next[idx] = stamped;
  else next.unshift(stamped);
  write(next);
  return next;
}

export function deleteStore(id: string): Store[] {
  const next = getStores().filter((s) => s.id !== id);
  write(next);
  return next;
}

export interface BulkResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** JSON 배열 일괄 업로드 (id가 같으면 덮어쓰기) */
export function bulkUpsert(raw: string): BulkResult {
  const result: BulkResult = { added: 0, updated: 0, skipped: 0, errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    result.errors.push('JSON 형식이 아닙니다. 대괄호로 감싼 배열인지 확인해 주세요.');
    return result;
  }
  if (!Array.isArray(parsed)) {
    result.errors.push('최상위가 배열이어야 합니다. 예: [ { "name": "..." }, ... ]');
    return result;
  }

  const stores = [...getStores()];
  parsed.forEach((item, i) => {
    const normalized = normalizeImported(item, i);
    if (!normalized) {
      result.skipped += 1;
      result.errors.push(`${i + 1}번 항목: name / lat / lng 가 필요합니다.`);
      return;
    }
    const idx = stores.findIndex((s) => s.id === normalized.id);
    if (idx >= 0) {
      stores[idx] = normalized;
      result.updated += 1;
    } else {
      stores.push(normalized);
      result.added += 1;
    }
  });

  write(stores);
  return result;
}

/** 업로드 데이터 정규화. 영업정보가 없으면 추측하지 않고 미확인으로 둔다. */
function normalizeImported(item: unknown, index: number): Store | null {
  const v = item as Partial<Store> & { lat?: number; lng?: number };
  if (!v || typeof v.name !== 'string' || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) {
    return null;
  }
  const b = v.business ?? {
    verified: false,
    breaks: [],
    closedWeekdays: [],
    temporarilyClosed: false,
    source: 'unknown' as const,
  };
  const hasHours = !!b.open && !!b.close;
  return {
    id: v.id || `import-${Date.now().toString(36)}-${index}`,
    name: v.name,
    category: v.category ?? 'etc',
    address: v.address ?? '주소 정보 없음',
    lat: v.lat!,
    lng: v.lng!,
    phone: v.phone,
    stayMinutes: Number.isFinite(v.stayMinutes) ? Number(v.stayMinutes) : 60,
    business: {
      verified: hasHours ? (b.verified ?? true) : false,
      open: b.open,
      close: b.close,
      lastOrder: b.lastOrder,
      breaks: Array.isArray(b.breaks) ? b.breaks : [],
      closedWeekdays: Array.isArray(b.closedWeekdays) ? b.closedWeekdays : [],
      temporarilyClosed: !!b.temporarilyClosed,
      note: b.note,
      source: hasHours ? (b.source ?? 'user') : 'unknown',
    },
    tempClosures: Array.isArray(v.tempClosures) ? v.tempClosures : [],
    verifiedAt: v.verifiedAt,
    sourceUrl: v.sourceUrl,
    dataKind: v.dataKind === 'real' ? 'real' : 'demo',
    updatedAt: new Date().toISOString(),
    memo: v.memo,
  };
}

export function exportJson(): string {
  return JSON.stringify(getStores(), null, 2);
}

/** 시드 상태로 되돌리기 */
export function resetToSeed(): Store[] {
  write(STORE_SEED);
  return STORE_SEED;
}

export interface DbStats {
  total: number;
  real: number;
  demo: number;
  /** 영업시간이 등록된 가게 수 */
  withHours: number;
  /** 브레이크 타임이 등록된 가게 수 */
  withBreaks: number;
  /** 영업정보 미확인 가게 수 */
  unverified: number;
  /** 최종 확인일이 없는 가게 수 */
  withoutVerifiedAt: number;
}

export function getStats(stores: Store[] = getStores()): DbStats {
  return {
    total: stores.length,
    real: stores.filter((s) => s.dataKind === 'real').length,
    demo: stores.filter((s) => s.dataKind === 'demo').length,
    withHours: stores.filter((s) => s.business.verified && s.business.open && s.business.close)
      .length,
    withBreaks: stores.filter((s) => s.business.breaks.length > 0).length,
    unverified: stores.filter((s) => !s.business.verified).length,
    withoutVerifiedAt: stores.filter((s) => !s.verifiedAt).length,
  };
}

/** 빈 가게 레코드 (관리자 신규 등록용) */
export function emptyStore(): Store {
  return {
    id: `store-${Date.now().toString(36)}`,
    name: '',
    category: 'cafe',
    address: '',
    lat: 35.1803,
    lng: 128.1087,
    stayMinutes: 60,
    business: {
      verified: false,
      breaks: [],
      closedWeekdays: [],
      temporarilyClosed: false,
      source: 'unknown',
    },
    tempClosures: [],
    dataKind: 'real',
    updatedAt: new Date().toISOString(),
  };
}
