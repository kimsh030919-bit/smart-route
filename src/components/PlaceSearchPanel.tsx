import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Hourglass, Info, Loader2, MapPin, Plus, Search } from 'lucide-react';
import type { Origin, PlaceSearchResult } from '../types';
import { CATEGORY_META } from '../data/categories';
import {
  availableSearchSources,
  searchPlaces,
  sortByDistance,
  sourceLabel,
  type SearchSource,
} from '../lib/placeSearch';
import { fetchOsmHours } from '../lib/osmHours';
import { breaksSummary, hoursSummary, latestArrival } from '../lib/businessHours';
import { formatClock, weekdayOf } from '../lib/time';

/** 한 번의 검색에서 지도 영업시간을 조회할 결과 수 (공개 Overpass 서버 부담을 줄인다) */
const HOURS_LOOKUP_LIMIT = 10;

/** 1km 미만은 m 단위로 */
function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

interface Props {
  /** 일정 날짜 "YYYY-MM-DD" — 그날 기준 영업시간/도착 마감 계산에 사용 */
  date: string;
  origin: Origin | null;
  /** 카카오 SDK 로드 상태가 바뀌면 사용 가능한 검색 소스를 다시 계산한다 */
  kakaoReady: boolean;
  addedIds: string[];
  full: boolean;
  onAdd: (result: PlaceSearchResult) => void;
}

export function PlaceSearchPanel({ date, origin, kakaoReady, addedIds, full, onAdd }: Props) {
  const weekday = weekdayOf(date);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sources = useMemo(() => availableSearchSources(), [kakaoReady]);
  const noSource = sources.length === 0;
  const [preferred, setPreferred] = useState<SearchSource>(sources[0] ?? 'vworld');

  // 사용 가능한 소스가 바뀌어 현재 선택이 유효하지 않으면 첫 번째 소스로 맞춘다
  useEffect(() => {
    if (!sources.includes(preferred)) setPreferred(sources[0]);
  }, [sources, preferred]);

  // 출발지가 바뀌면 다시 검색하지 않고도 현재 목록을 가까운 순으로 재정렬
  useEffect(() => {
    if (!origin) return;
    setResults((prev) => sortByDistance(prev, origin));
  }, [origin]);
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [source, setSource] = useState<SearchSource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoursLoading, setHoursLoading] = useState(false);
  /** 지도 영업시간을 실제로 조회해 본 결과 id (조회 안 한 곳과 "정보 없음"을 구분하기 위해) */
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  /** 지도 영업시간 조회가 실패했을 때의 안내 (무료 공개 서버는 자주 혼잡하다) */
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 검색이 바뀌면 이전 영업시간 조회는 버린다 */
  const hoursAbort = useRef<AbortController | null>(null);

  /**
   * 검색 결과의 **실제 지도 영업시간**을 OpenStreetMap 에서 채운다.
   * 목록에서부터 진짜 영업시간이 보이도록, 가까운 순 앞쪽 결과를 한 번의 호출로 조회한다.
   * 지도에 등록이 없는 장소는 손대지 않고 "지도에 영업시간 정보 없음"으로 남긴다.
   * (영업시간을 임의로 만들어 넣지 않는다)
   */
  async function fillHours(list: PlaceSearchResult[]) {
    hoursAbort.current?.abort();
    const ctrl = new AbortController();
    hoursAbort.current = ctrl;
    setCheckedIds(new Set());
    setHoursError(null);
    if (list.length === 0) return;

    // 전국에 흩어진 결과를 한꺼번에 조회하면 공개 Overpass 서버가 느려진다.
    // 가까운 순으로 앞쪽 일부만 조회하고, 나머지는 담을 때 자동으로 채운다.
    const target = list.slice(0, HOURS_LOOKUP_LIMIT);

    setHoursLoading(true);
    try {
      const found = await fetchOsmHours(
        target.map((r) => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng })),
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      setCheckedIds(new Set(target.map((r) => r.id)));
      if (found.size === 0) return;
      setResults((prev) =>
        prev.map((r) => {
          const m = found.get(r.id);
          return m ? { ...r, business: m.business } : r;
        }),
      );
    } catch (e) {
      // 조회 실패는 목록 표시를 막지 않는다. 다만 왜 영업시간이 비었는지는 알려 준다.
      if (!ctrl.signal.aborted) {
        setHoursError(
          e instanceof Error ? e.message : '지도 영업시간을 불러오지 못했습니다.',
        );
      }
    } finally {
      if (!ctrl.signal.aborted) setHoursLoading(false);
    }
  }

  async function run(e?: React.FormEvent, overrideSource?: SearchSource) {
    e?.preventDefault();
    const use = overrideSource ?? preferred;
    const q = keyword.trim();
    if (!q) {
      setResults([]);
      setSource(null);
      setNotice(null);
      setError('검색어를 입력해 주세요.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchPlaces(q, origin, use);
      setResults(res.results);
      setSource(res.source);
      setNotice(res.notice);
      if (res.results.length === 0) {
        setError('검색 결과가 없습니다. 다른 키워드로 시도해 보세요.');
      } else {
        void fillHours(res.results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.');
      setResults([]);
      setSource(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
          <Search size={17} className="text-brand-600" />
          방문 장소 검색
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {origin ? (
            <span className="chip bg-brand-50 text-brand-700">
              <MapPin size={11} />
              {origin.name} 가까운 순
            </span>
          ) : (
            <span className="chip bg-navy-100 text-navy-600">출발지 미설정 · 관련도순</span>
          )}
          {source && (
            <span className="chip bg-emerald-50 text-emerald-700">{sourceLabel(source)} 결과</span>
          )}
        </div>
      </div>

      {sources.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sources.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setPreferred(s);
                if (keyword.trim()) void run(undefined, s);
              }}
              className={`chip border transition-colors ${
                preferred === s
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-navy-200 bg-white text-navy-600 hover:bg-navy-50'
              }`}
            >
              {sourceLabel(s)}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={run} className="mt-3 flex gap-2">
        <input
          className="input"
          placeholder={
            preferred === 'vworld'
              ? '지명·주소 검색 (예: 서울숲, 성수동)'
              : '장소 이름 검색 (예: 성수 카페, 서울숲)'
          }
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button
          type="submit"
          className="btn-primary shrink-0 px-4 py-2.5"
          disabled={loading || noSource}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          검색
        </button>
      </form>

      {noSource && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          장소를 검색할 수 있는 지도 API 키가 설정되어 있지 않습니다. <code>.env</code> 에
          <strong> VITE_VWORLD_API_KEY</strong> 또는 <strong>VITE_KAKAO_MAP_KEY</strong> 를 넣어
          주세요.
        </p>
      )}

      {notice && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-navy-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-navy-600">
          <Info size={14} className="mt-0.5 shrink-0" />
          {notice}
        </p>
      )}

      {hoursError && results.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-900">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>
            {hoursError} 목록의 영업시간은 비어 있지만, 장소를 담으면 자동으로 다시 조회합니다.
            <button
              type="button"
              className="ml-1.5 font-bold underline underline-offset-2"
              onClick={() => void fillHours(results)}
              disabled={hoursLoading}
            >
              지금 다시 시도
            </button>
          </span>
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-rose-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {full && (
        <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
          장소는 최대 10곳까지 추가할 수 있습니다. 먼저 일부를 삭제해 주세요.
        </p>
      )}

      {results.length === 0 && !loading && !error && !noSource && (
        <p className="mt-4 rounded-xl border border-dashed border-navy-200 bg-navy-50/60 px-4 py-8 text-center text-[13px] leading-relaxed text-navy-500">
          가고 싶은 장소를 검색해 주세요.
          <br />
          담으면 지도에 등록된 실제 영업시간을 자동으로 찾아 채웁니다.
        </p>
      )}

      <ul className="scroll-thin mt-4 max-h-[22rem] divide-y divide-navy-100 overflow-y-auto rounded-xl border border-navy-100 empty:hidden empty:border-0">
        {results.map((r) => {
          const meta = CATEGORY_META[r.category];
          const Icon = meta.icon;
          const added = addedIds.includes(r.id);
          return (
            <li key={r.id} className="flex items-start gap-3 px-3.5 py-3">
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
              >
                <Icon size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-navy-900">
                  {r.name}
                  <span className={`chip ${meta.bg}`}>{meta.label}</span>
                  {r.business.source === 'osm' ? (
                    <span className="chip bg-emerald-50 text-emerald-700">지도 영업시간</span>
                  ) : (
                    !r.business.verified &&
                    !hoursLoading &&
                    checkedIds.has(r.id) && (
                      <span className="chip bg-amber-50 text-amber-700">정보 확인 필요</span>
                    )
                  )}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-navy-400">{r.address}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-navy-500">
                  {r.distanceKm !== undefined && (
                    <span className="font-semibold text-brand-700">
                      출발지에서 {formatDistance(r.distanceKm)}
                    </span>
                  )}
                  <span>
                    {r.business.verified ? (
                      <>
                        영업 {hoursSummary(r.business, weekday ?? undefined)}
                        {r.business.breaks.length > 0 &&
                          ` · 브레이크 ${breaksSummary(r.business, weekday ?? undefined)}`}
                      </>
                    ) : hoursLoading ? (
                      <span className="inline-flex items-center gap-1 text-navy-400">
                        <Loader2 size={11} className="animate-spin" />
                        지도에서 영업시간 확인 중
                      </span>
                    ) : checkedIds.has(r.id) ? (
                      <span className="text-navy-400">지도에 영업시간 정보 없음</span>
                    ) : (
                      <span className="text-navy-400">담으면 영업시간을 확인합니다</span>
                    )}
                    {' · 체류 '}
                    {r.defaultStayMinutes}분
                  </span>
                </p>
                {(() => {
                  if (weekday === null) return null;
                  const deadline = latestArrival(
                    r.business,
                    weekday,
                    r.defaultStayMinutes,
                    date,
                  );
                  if (deadline === null) return null;
                  return (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11.5px] font-semibold text-brand-700">
                      <Hourglass size={10} />
                      {formatClock(deadline)}까지 도착
                    </p>
                  );
                })()}
              </div>
              <button
                type="button"
                onClick={() => onAdd(r)}
                disabled={added || full}
                className={`btn shrink-0 px-3 py-1.5 text-[13px] ${
                  added
                    ? 'bg-navy-100 text-navy-500'
                    : 'border border-brand-600 text-brand-700 hover:bg-brand-50'
                }`}
              >
                {added ? <Check size={14} /> : <Plus size={14} />}
                {added ? '추가됨' : '추가'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
