import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Info, Loader2, MapPin, Plus, Search } from 'lucide-react';
import type { Origin, PlaceSearchResult } from '../types';
import { CATEGORY_META } from '../data/categories';
import {
  availableSearchSources,
  searchPlaces,
  sortByDistance,
  sourceLabel,
  type SearchSource,
} from '../lib/placeSearch';
import { searchDemoPlaces } from '../data/demoPlaces';
import { hoursSummary } from '../lib/businessHours';

/** 1km 미만은 m 단위로 */
function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

interface Props {
  origin: Origin | null;
  /** 카카오 SDK 로드 상태가 바뀌면 사용 가능한 검색 소스를 다시 계산한다 */
  kakaoReady: boolean;
  addedIds: string[];
  full: boolean;
  onAdd: (result: PlaceSearchResult) => void;
}

export function PlaceSearchPanel({ origin, kakaoReady, addedIds, full, onAdd }: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sources = useMemo(() => availableSearchSources(), [kakaoReady]);
  const [preferred, setPreferred] = useState<SearchSource>(sources[0]);

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
  const [results, setResults] = useState<PlaceSearchResult[]>(() =>
    sortByDistance(searchDemoPlaces(''), origin),
  );
  const [source, setSource] = useState<SearchSource>('demo');
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onlyDemo = sources.length === 1 && sources[0] === 'demo';

  async function run(e?: React.FormEvent, overrideSource?: SearchSource) {
    e?.preventDefault();
    const use = overrideSource ?? preferred;
    const q = keyword.trim();
    if (!q) {
      setResults(sortByDistance(searchDemoPlaces(''), origin));
      setSource('demo');
      setNotice(null);
      setError(null);
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
        setError(
          res.source === 'demo'
            ? '데모 데이터에 해당하는 장소가 없습니다. 키워드를 비우면 전체 데모 장소를 볼 수 있어요.'
            : '검색 결과가 없습니다. 다른 키워드로 시도해 보세요.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.');
      // 실패 시 데모 데이터로 폴백 (시연이 끊기지 않도록)
      setResults(sortByDistance(searchDemoPlaces(q), origin));
      setSource('demo');
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
          <span
            className={`chip ${
              source === 'demo' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {sourceLabel(source)} 결과
          </span>
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
            preferred === 'demo'
              ? '데모 장소 검색 (예: 카페, 음식점, 공원)'
              : preferred === 'vworld'
                ? '지명·주소 검색 (예: 서울숲, 성수동)'
                : '장소 이름 검색 (예: 성수 카페, 서울숲)'
          }
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button type="submit" className="btn-primary shrink-0 px-4 py-2.5" disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          검색
        </button>
      </form>

      {onlyDemo && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
          <Info size={14} className="mt-0.5 shrink-0" />
          지도 API 키가 없어 <strong>데모 데이터</strong>로 검색합니다. 데모 장소는 영업시간·휴무·브레이크
          타임이 미리 설정되어 있어 모든 기능을 그대로 시연할 수 있습니다.
        </p>
      )}

      {notice && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-navy-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-navy-600">
          <Info size={14} className="mt-0.5 shrink-0" />
          {notice}
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

      <ul className="scroll-thin mt-4 max-h-[22rem] divide-y divide-navy-100 overflow-y-auto rounded-xl border border-navy-100">
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
                  {!r.business.verified && (
                    <span className="chip bg-amber-50 text-amber-700">정보 확인 필요</span>
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
                    영업 {hoursSummary(r.business)} · 기본 체류 {r.defaultStayMinutes}분
                  </span>
                </p>
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
