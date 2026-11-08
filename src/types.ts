/** 장소 카테고리 */
export type Category = 'cafe' | 'food' | 'attraction' | 'shopping' | 'cinema' | 'park' | 'etc';

/** 이동수단 */
export type TransportMode = 'walk' | 'transit' | 'car' | 'bike';

/** 방문 우선순위 */
export type Priority = 'high' | 'normal' | 'low';

/**
 * 영업정보 출처
 *  - demo      : 내장 데모 데이터
 *  - user      : 사용자가 직접 입력 (확인된 정보로 취급)
 *  - estimated : 업종 평균으로 채운 추정값 (확인된 정보 아님 — UI에 항상 '추정'으로 표시)
 *  - unknown   : 확인 안 됨
 */
export type HoursSource = 'demo' | 'user' | 'estimated' | 'unknown';

export interface TimeRange {
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
}

/** 특정 요일의 영업 설정 (기본 영업시간을 덮어쓴다) */
export interface DayHours {
  /** 이 요일은 휴무 */
  closed: boolean;
  /** "HH:MM" */
  open?: string;
  /** "HH:MM" */
  close?: string;
  /** "HH:MM" */
  lastOrder?: string;
  breaks: TimeRange[];
}

/** 날짜를 지정한 임시 휴무 */
export interface TempClosure {
  /** "YYYY-MM-DD" */
  date: string;
  reason?: string;
}

/**
 * 영업정보.
 * verified=false 이면 UI에 "정보 확인 필요"로 표시하고,
 * 동선 계산에서 영업시간 제약을 적용하지 않는다. (임의로 시간을 만들어 내지 않음)
 */
export interface BusinessInfo {
  verified: boolean;
  /** 영업 시작 "HH:MM" */
  open?: string;
  /** 영업 종료 "HH:MM" (자정 넘김은 24:00 초과 값으로 표기 가능: 예 "25:00") */
  close?: string;
  /** 라스트 오더 "HH:MM" */
  lastOrder?: string;
  /** 브레이크 타임 (복수 가능) */
  breaks: TimeRange[];
  /** 정기 휴무일 (0=일 ~ 6=토) */
  closedWeekdays: number[];
  /**
   * 요일별 영업시간. 길이 7 배열 (0=일 ~ 6=토).
   * 해당 요일 값이 있으면 기본 영업시간(open/close/lastOrder/breaks)보다 우선한다.
   * null 이면 그 요일은 기본값을 따른다.
   */
  weeklyHours?: (DayHours | null)[];
  /** 날짜를 지정한 임시 휴무 (예: 12월 25일 휴무) */
  tempClosures?: TempClosure[];
  /** 임시 휴무 (오늘/상시 휴업 표시) */
  temporarilyClosed: boolean;
  /** 메모 (예: "매월 첫째 주 월요일 휴무") */
  note?: string;
  source: HoursSource;
}

export interface Place {
  id: string;
  name: string;
  category: Category;
  address: string;
  lat: number;
  lng: number;
  /** 예상 체류시간(분) */
  stayMinutes: number;
  priority: Priority;
  business: BusinessInfo;
  /**
   * 희망 방문 시간 "HH:MM".
   * 지정하면 이 시각 이후에 도착하도록 일정을 맞춘다. (예: "20:00" → 저녁에 방문)
   */
  preferredArrival?: string;
  /** 데모 데이터에서 추가된 장소인지 */
  isDemo?: boolean;
}

/** 검색 결과 (아직 일정에 추가되지 않은 상태) */
export interface PlaceSearchResult {
  id: string;
  name: string;
  category: Category;
  address: string;
  lat: number;
  lng: number;
  defaultStayMinutes: number;
  business: BusinessInfo;
  isDemo?: boolean;
  /** 출발지로부터의 직선거리(km). 출발지가 설정된 경우에만 채워진다. */
  distanceKm?: number;
}

export interface Origin {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface TripSettings {
  /** "YYYY-MM-DD" */
  date: string;
  /** 출발 시간 "HH:MM" */
  startTime: string;
  /** 일정 종료 희망 시간 "HH:MM" */
  endTime: string;
  mode: TransportMode;
  origin: Origin | null;
}

/** 특정 장소를 일정에 넣을 수 없는 이유 */
export type ExclusionReason =
  | 'closed_weekday'
  | 'temporarily_closed'
  | 'arrive_after_close'
  | 'break_conflict'
  | 'stay_too_long'
  | 'after_last_order'
  | 'over_end_time'
  | 'preferred_time'
  | 'unreachable';

export interface ExcludedPlace {
  place: Place;
  reason: ExclusionReason;
  detail: string;
}

export interface StopFlags {
  /** 영업 시작까지 대기 */
  waitedForOpen: boolean;
  /** 브레이크 타임을 피하기 위해 시간을 늦춤 */
  breakAvoided: boolean;
  /** 영업정보 미확인 */
  unverified: boolean;
  /** 라스트 오더 30분 이내 도착 */
  nearLastOrder: boolean;
  /** 영업 종료 30분 이내 종료 */
  nearClose: boolean;
}

export interface Stop {
  order: number;
  place: Place;
  /** 분 단위 (0 = 00:00) */
  arrival: number;
  start: number;
  end: number;
  waitMinutes: number;
  travelFromPrevMinutes: number;
  distanceFromPrevKm: number;
  flags: StopFlags;
}

export type WarningLevel = 'info' | 'warn' | 'error';

export interface Warning {
  level: WarningLevel;
  title: string;
  message: string;
}

export interface Suggestion {
  title: string;
  message: string;
}

export interface ScheduleResult {
  /** 모든 장소를 일정에 넣었는지 */
  feasible: boolean;
  stops: Stop[];
  excluded: ExcludedPlace[];
  totalTravelMinutes: number;
  totalDistanceKm: number;
  totalWaitMinutes: number;
  totalStayMinutes: number;
  /** 출발 시각(분) */
  startMinutes: number;
  /** 마지막 일정 종료 시각(분) */
  endMinutes: number;
  warnings: Warning[];
  suggestions: Suggestion[];
  /** 거리만 고려한 단순 최단거리 순서와의 비교 */
  comparison: NaiveComparison | null;
  mode: TransportMode;
  date: string;
  /** 계산에 사용된 추정 방식 설명 */
  estimateNote: string;
}

export interface NaiveComparison {
  /** 단순 최근접(최단거리) 순서 */
  orderNames: string[];
  travelMinutes: number;
  distanceKm: number;
  /** 영업 시작/브레이크 타임 때문에 발생하는 대기시간 합계(분) */
  waitMinutes: number;
  /** 단순 순서로 갔을 때 발생하는 헛걸음/충돌 건수 */
  conflictCount: number;
  conflicts: string[];
  endMinutes: number | null;
}
