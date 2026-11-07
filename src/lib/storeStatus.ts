import type { Place, Store, StoreEvaluation, StoreStatus } from '../types';
import { breakRanges, openWindows } from './businessHours';
import { WEEKDAY_LABELS, formatClock, toMinutes, weekdayOf } from './time';

/**
 * 특정 날짜/시각 기준으로 가게 방문 가능 여부를 판정한다.
 * 영업정보가 없으면 추측하지 않고 'unknown'(정보 없음)으로 둔다.
 */

/** 해당 날짜에 임시 휴무인지 */
export function isTempClosedOn(store: Store, date: string): boolean {
  return store.tempClosures.some((c) => c.date === date) || store.business.temporarilyClosed;
}

export function evaluateStore(store: Store, date: string, arrivalMinutes: number): StoreEvaluation {
  const weekday = weekdayOf(date);
  const info = store.business;

  if (isTempClosedOn(store, date)) {
    const hit = store.tempClosures.find((c) => c.date === date);
    return {
      status: 'temp_closed',
      detail: hit?.reason ? `임시 휴무 (${hit.reason})` : '임시 휴무로 등록된 날짜입니다.',
    };
  }

  if (weekday !== null && info.verified && info.closedWeekdays.includes(weekday)) {
    return {
      status: 'closed_weekday',
      detail: `${WEEKDAY_LABELS[weekday]}요일 정기 휴무입니다.`,
    };
  }

  if (!info.verified || !info.open || !info.close) {
    return {
      status: 'unknown',
      detail: '영업시간 정보가 없습니다. 방문 전 직접 확인이 필요합니다.',
    };
  }

  const open = toMinutes(info.open)!;
  const close = toMinutes(info.close)!;
  const lastOrder = toMinutes(info.lastOrder);
  const breaks = breakRanges(info);

  if (arrivalMinutes < open) {
    return {
      status: 'before_open',
      detail: `영업 시작 ${info.open} 전입니다. ${open - arrivalMinutes}분 기다리면 입장할 수 있어요.`,
      waitMinutes: open - arrivalMinutes,
    };
  }
  if (arrivalMinutes >= close) {
    return { status: 'after_close', detail: `영업 종료(${info.close}) 이후 도착입니다.` };
  }

  const inBreak = breaks.find((b) => arrivalMinutes >= b.start && arrivalMinutes < b.end);
  if (inBreak) {
    return {
      status: 'break',
      detail: `브레이크 타임(${formatClock(inBreak.start)}~${formatClock(inBreak.end)}) 중 도착입니다. ${formatClock(
        inBreak.end,
      )}부터 이용할 수 있어요.`,
      resumeAt: inBreak.end,
      waitMinutes: inBreak.end - arrivalMinutes,
    };
  }

  if (lastOrder !== null && arrivalMinutes > lastOrder) {
    return {
      status: 'after_last_order',
      detail: `라스트 오더(${info.lastOrder})가 지난 시각에 도착합니다.`,
    };
  }

  // 영업 시간창 안에 들어가는지 최종 확인
  const windows = openWindows(info, weekday ?? 0);
  const inWindow = (windows ?? []).some((w) => arrivalMinutes >= w.start && arrivalMinutes < w.end);
  if (!inWindow) {
    return { status: 'after_close', detail: '도착 시각에 영업하지 않습니다.' };
  }

  return {
    status: 'open',
    detail: `영업 중 (${info.open}~${info.close})${info.lastOrder ? ` · 라스트오더 ${info.lastOrder}` : ''}`,
  };
}

export const STATUS_META: Record<
  StoreStatus,
  { label: string; chip: string; marker: string; visitable: boolean }
> = {
  open: { label: '영업 중', chip: 'bg-emerald-50 text-emerald-700', marker: '#059669', visitable: true },
  before_open: {
    label: '영업 전 (대기 필요)',
    chip: 'bg-amber-50 text-amber-700',
    marker: '#d97706',
    visitable: true,
  },
  break: {
    label: '브레이크 타임',
    chip: 'bg-orange-50 text-orange-700',
    marker: '#ea580c',
    visitable: false,
  },
  after_close: { label: '영업 종료', chip: 'bg-navy-100 text-navy-500', marker: '#94a3b8', visitable: false },
  after_last_order: {
    label: '라스트 오더 경과',
    chip: 'bg-navy-100 text-navy-500',
    marker: '#94a3b8',
    visitable: false,
  },
  closed_weekday: { label: '정기 휴무', chip: 'bg-rose-50 text-rose-700', marker: '#e11d48', visitable: false },
  temp_closed: { label: '임시 휴무', chip: 'bg-rose-50 text-rose-700', marker: '#be123c', visitable: false },
  unknown: {
    label: '영업정보 없음',
    chip: 'bg-amber-50 text-amber-700',
    marker: '#b45309',
    visitable: true,
  },
};

/** 가게 레코드를 기존 플래너(Place) 모델로 변환 — 최적 일정 계산에 재사용 */
export function storeToPlace(store: Store, date: string): Place {
  return {
    id: store.id,
    name: store.name,
    category: store.category,
    address: store.address,
    lat: store.lat,
    lng: store.lng,
    stayMinutes: store.stayMinutes,
    priority: 'normal',
    business: {
      ...store.business,
      // 날짜 지정 임시 휴무를 당일 임시 휴무로 반영
      temporarilyClosed: isTempClosedOn(store, date),
      breaks: store.business.breaks.map((b) => ({ ...b })),
    },
    isDemo: store.dataKind === 'demo',
  };
}
