import type { BusinessInfo, Category, PlaceSearchResult } from '../types';

/**
 * 영업정보가 없는 장소에 넣는 **업종 평균 기준 추정 영업시간**.
 *
 * ⚠️ 매우 중요
 *  - 이 값은 실제로 확인한 정보가 아니다. 그 가게의 진짜 영업시간과 다를 수 있다.
 *  - 그래서 source: 'estimated' 로 표시하고, UI에서는 항상 "추정"이라고 알린다.
 *  - 사용자가 직접 입력하면 source: 'user' 로 바뀌며 추정 딱지가 사라진다.
 *  - 업종을 알 수 없는 'etc' 는 추정하지 않는다. (근거가 없으면 만들지 않는다)
 */

export interface CategoryHoursEstimate {
  open: string;
  close: string;
  lastOrder?: string;
  breaks: { start: string; end: string }[];
  closedWeekdays: number[];
  /** 추정 근거 설명 */
  basis: string;
}

/** 업종별 일반적인 운영 패턴 (국내 상권 기준 통상값) */
export const CATEGORY_HOURS_ESTIMATE: Partial<Record<Category, CategoryHoursEstimate>> = {
  cafe: {
    open: '10:00',
    close: '22:00',
    lastOrder: '21:30',
    breaks: [],
    closedWeekdays: [],
    basis: '카페 업종 통상 운영시간 (10:00~22:00, 라스트오더 마감 30분 전)',
  },
  food: {
    open: '11:00',
    close: '21:00',
    lastOrder: '20:30',
    breaks: [{ start: '15:00', end: '17:00' }],
    closedWeekdays: [],
    basis: '음식점 업종 통상 운영시간 (11:00~21:00, 브레이크 15:00~17:00)',
  },
  attraction: {
    open: '09:00',
    close: '18:00',
    breaks: [],
    closedWeekdays: [1],
    basis: '관광·전시시설 통상 운영시간 (09:00~18:00, 월요일 휴관이 많음)',
  },
  shopping: {
    open: '10:30',
    close: '21:00',
    breaks: [],
    closedWeekdays: [],
    basis: '쇼핑시설 통상 운영시간 (10:30~21:00)',
  },
  cinema: {
    open: '10:00',
    close: '23:30',
    breaks: [],
    closedWeekdays: [],
    basis: '영화관 통상 운영시간 (10:00~23:30)',
  },
  park: {
    open: '05:00',
    close: '23:00',
    breaks: [],
    closedWeekdays: [],
    basis: '공원·산책로 통상 개방시간 (05:00~23:00)',
  },
  etc: {
    open: '10:00',
    close: '20:00',
    breaks: [],
    closedWeekdays: [],
    basis: '일반 상가 통상 운영시간 (10:00~20:00)',
  },
};

/** 영업정보가 비어 있는지 (영업 시작/종료가 없으면 비어 있는 것으로 본다) */
export function hasNoHours(info: BusinessInfo): boolean {
  return !info.open || !info.close;
}

/** 추정으로 채워진 영업정보인지 */
export function isEstimated(info: BusinessInfo): boolean {
  return info.source === 'estimated';
}

/**
 * 업종 추정값으로 채운 영업정보를 만든다.
 * 추정할 수 없는 업종이면 원본을 그대로 돌려준다.
 */
export function withEstimatedHours(info: BusinessInfo, category: Category): BusinessInfo {
  if (!hasNoHours(info) || info.verified) return info;
  const est = CATEGORY_HOURS_ESTIMATE[category];
  if (!est) return info;

  return {
    ...info,
    // 일정 계산에는 사용하되, 출처를 'estimated'로 남겨 확인된 정보와 구분한다
    verified: true,
    open: est.open,
    close: est.close,
    lastOrder: est.lastOrder,
    breaks: est.breaks.map((b) => ({ ...b })),
    closedWeekdays: [...est.closedWeekdays],
    note: `추정값 · ${est.basis}. 실제 영업시간과 다를 수 있으니 방문 전 확인하세요.`,
    source: 'estimated',
  };
}

/** 검색 결과 목록에 추정 영업시간을 채운다 */
export function applyEstimates(results: PlaceSearchResult[]): PlaceSearchResult[] {
  return results.map((r) => ({
    ...r,
    business: withEstimatedHours(r.business, r.category),
  }));
}
