/** 장소 카테고리 */
export type Category = 'cafe' | 'food' | 'attraction' | 'shopping' | 'cinema' | 'park' | 'etc';

/** 이동수단 */
export type TransportMode = 'walk' | 'transit' | 'car' | 'bike';

/** 방문 우선순위 */
export type Priority = 'high' | 'normal' | 'low';

/** 영업정보 출처 (demo: 내장 데모 데이터, user: 사용자가 직접 입력, unknown: 확인 안 됨) */
export type HoursSource = 'demo' | 'user' | 'unknown';

export interface TimeRange {
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
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
  /** 임시 휴무 */
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

/* ───────────────────────── 가게 데이터베이스 ───────────────────────── */

/** 임시 휴무 (특정 날짜) */
export interface TempClosure {
  /** "YYYY-MM-DD" */
  date: string;
  reason?: string;
}

/**
 * 데이터 종류
 *  - real : 실제로 확인한 장소 (출처/확인일 보유)
 *  - demo : 알고리즘 시연용 가상 가게 (이름에 [데모] 표기)
 *  - live : 지도 검색 API에서 실시간으로 찾은 실제 장소.
 *           이름·주소·좌표는 실제지만 영업정보는 제공되지 않아 항상 "정보 없음"이다.
 */
export type StoreDataKind = 'real' | 'demo' | 'live';

export interface Store {
  id: string;
  name: string;
  category: Category;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  /** 예상 체류시간(분) */
  stayMinutes: number;
  /** 영업시간·휴무·브레이크타임 (verified=false면 "정보 없음") */
  business: BusinessInfo;
  /** 날짜 지정 임시 휴무 */
  tempClosures: TempClosure[];
  /** 정보 최종 확인 날짜 "YYYY-MM-DD" (없으면 미확인) */
  verifiedAt?: string;
  /** 영업정보 출처 (URL 또는 기관명) */
  sourceUrl?: string;
  dataKind: StoreDataKind;
  /** 레코드 수정 시각 ISO */
  updatedAt: string;
  memo?: string;
}

/** 특정 시각 기준 가게 방문 가능 상태 */
export type StoreStatus =
  | 'open' // 영업 중 (방문 가능)
  | 'break' // 브레이크 타임
  | 'before_open' // 아직 영업 전 (대기하면 가능)
  | 'after_close' // 영업 종료
  | 'after_last_order' // 라스트 오더 경과
  | 'closed_weekday' // 정기 휴무
  | 'temp_closed' // 임시 휴무
  | 'unknown'; // 영업정보 미확인

export interface StoreEvaluation {
  status: StoreStatus;
  /** 사용자에게 보여줄 설명 */
  detail: string;
  /** 영업 시작까지 기다리면 방문 가능한 경우의 대기 시간(분) */
  waitMinutes?: number;
  /** 브레이크 종료 후 방문 가능한 경우의 시작 시각(분) */
  resumeAt?: number;
}

export interface RouteGeometryPoint {
  lng: number;
  lat: number;
}

export type RoutingProvider = 'osrm' | 'ors' | 'straight';

export interface RouteLeg {
  distanceKm: number;
  durationMin: number;
  /** 실제 도로 경로 좌표열 */
  geometry: RouteGeometryPoint[];
  provider: RoutingProvider;
  /** 도로망 기반 실제 경로인지 (false면 직선 추정) */
  realRoad: boolean;
  /** 소요시간이 라우팅 엔진 실측인지 (false면 속도 기반 추정) */
  realDuration: boolean;
  note: string;
}

/** 경로 주변에서 찾은 가게 1건 */
export interface RouteCandidate {
  store: Store;
  /** 출발지 → 가게 실제 도로 이동거리(km) */
  travelKm: number;
  /** 출발지 → 가게 이동시간(분) */
  travelMin: number;
  /** 이동거리/시간이 실제 도로 기준인지 */
  realRoad: boolean;
  realDuration: boolean;
  /** 경로 중심선에서 벗어난 직선거리(km) */
  detourKm: number;
  /** 경로 시작점에서의 진행 거리(km) — 경로 진행순 정렬용 */
  alongKm: number;
  /** 도착 예정 시각(분) */
  arrivalMinutes: number;
  evaluation: StoreEvaluation;
  /** 방문 순번 (방문 가능한 가게만 부여) */
  order?: number;
  /** 방문할 수 없을 때 제안하는 같은 업종의 대체 장소 */
  alternative?: {
    candidate: RouteCandidate;
    /** 원래 가려던 장소에서 대체 장소까지의 직선거리(km) */
    distanceKm: number;
  };
}

export interface RouteSearchParams {
  origin: Origin;
  destination: Origin;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  startTime: string;
  mode: TransportMode;
  /** 빈 배열이면 전체 */
  categories: Category[];
  /** 경로 주변 검색 반경(km) */
  radiusKm: number;
  /** 최대 추천 개수 */
  limit: number;
}

export interface RouteSearchResult {
  params: RouteSearchParams;
  /** 출발지 → 도착지 기본 경로 */
  baseRoute: RouteLeg;
  /** 방문 가능한 가게 (거리순) */
  visitable: RouteCandidate[];
  /** 방문할 수 없는 가게 + 이유 */
  unvisitable: RouteCandidate[];
  /** 도착지 주변 장소 (도착지에서 가까운 순). travelKm/travelMin은 도착지 기준 */
  nearDestination: RouteCandidate[];
  /** 도착지 도착 예정 시각(분) */
  destinationArrivalMinutes: number;
  /** 검색 대상이 된 전체 가게 수 */
  scannedCount: number;
  /** 데이터 출처 안내 */
  notes: string[];
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
