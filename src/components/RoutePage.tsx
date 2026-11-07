import { Suspense, lazy, useCallback, useState } from 'react';
import { AlertCircle, Layers, ListOrdered, Loader2, Map as MapIcon, Wand2 } from 'lucide-react';
import type { RouteSearchParams, RouteSearchResult, ScheduleResult } from '../types';
import { RouteSearchPanel } from './RouteSearchPanel';
import { RouteResultList } from './RouteResultList';

// 지도(OpenLayers)는 별도 청크로 분리해 초기 로딩을 가볍게 유지한다.
const StoreRouteMap = lazy(() =>
  import('./StoreRouteMap').then((m) => ({ default: m.StoreRouteMap })),
);
import { Timeline } from './Timeline';
import { WarningPanel } from './WarningPanel';
import { SAMPLE_ROUTES } from '../data/storeSeed';
import { buildOptimizedPlan, searchAlongRoute } from '../lib/routeRecommend';
import { VWORLD_LAYERS, hasVworldKey, type VworldLayer } from '../lib/vworld';
import { todayISO } from '../lib/time';

type Mode = 'distance' | 'optimized';

const DEFAULT_PARAMS: RouteSearchParams = {
  origin: { ...SAMPLE_ROUTES[0].origin },
  destination: { ...SAMPLE_ROUTES[0].destination },
  date: todayISO(),
  startTime: '11:00',
  mode: 'car',
  categories: [],
  radiusKm: 1.5,
  limit: 8,
};

interface Props {
  canSearchPlaces: boolean;
}

export function RoutePage({ canSearchPlaces }: Props) {
  const [params, setParams] = useState<RouteSearchParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<RouteSearchResult | null>(null);
  const [plan, setPlan] = useState<ScheduleResult | null>(null);
  const [mode, setMode] = useState<Mode>('distance');
  const [loading, setLoading] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layer, setLayer] = useState<VworldLayer>('Base');

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlan(null);
    setMode('distance');
    try {
      const res = await searchAlongRoute(params);
      setResult(res);
      setSelectedId(null);
      if (res.visitable.length === 0 && res.unvisitable.length === 0) {
        setError('경로 주변에서 등록된 장소를 찾지 못했습니다. 검색 범위를 넓혀 보세요.');
      }
    } catch (e) {
      setResult(null);
      setError(
        e instanceof Error
          ? `경로 검색 중 오류가 발생했습니다: ${e.message}`
          : '경로 검색 중 알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setLoading(false);
    }
  }, [params]);

  const runOptimize = useCallback(async () => {
    if (!result) return;
    setPlanning(true);
    setError(null);
    try {
      const p = await buildOptimizedPlan(result);
      if (!p) {
        setError('최적 일정을 만들려면 방문 가능한 장소가 2곳 이상 필요합니다.');
        return;
      }
      setPlan(p);
      setMode('optimized');
    } catch (e) {
      setError(e instanceof Error ? `최적 일정 계산 실패: ${e.message}` : '최적 일정 계산에 실패했습니다.');
    } finally {
      setPlanning(false);
    }
  }, [result]);

  const candidates = result ? [...result.visitable, ...result.unvisitable] : [];

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-[26px] font-extrabold tracking-tight text-navy-900 sm:text-[30px]">
          경로 주변 장소 추천
        </h2>
        <p className="mt-2.5 text-[15px] leading-relaxed text-navy-500">
          출발지와 도착지를 입력하면 이동 경로 주변에 있는 장소를 찾아, 출발지에서 가까운 순으로
          보여 줍니다. 영업시간 · 정기 휴무 · 임시 휴무 · 브레이크 타임을 확인해 방문 가능한 곳과
          그렇지 않은 곳을 구분합니다.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
          <div>
            <RouteSearchPanel
              params={params}
              onChange={setParams}
              onSearch={runSearch}
              loading={loading}
              canSearchPlaces={canSearchPlaces}
            />
          </div>

          <div className="space-y-5">
            {/* 지도 */}
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-5 py-3.5">
                <h3 className="flex items-center gap-2 text-[15px] font-bold text-navy-900">
                  <MapIcon size={16} className="text-brand-600" />
                  경로 지도
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="chip bg-emerald-50 text-emerald-700">● 출발지</span>
                  <span className="chip bg-rose-50 text-rose-700">● 도착지</span>
                  <span className="chip bg-navy-100 text-navy-600">숫자 = 방문 순서</span>
                </div>
              </div>
              {hasVworldKey() && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-navy-100 px-5 py-2.5">
                  <span className="flex items-center gap-1 text-[11.5px] font-semibold text-navy-400">
                    <Layers size={12} />
                    배경지도
                  </span>
                  {VWORLD_LAYERS.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setLayer(l.key)}
                      className={`chip border ${
                        layer === l.key
                          ? 'border-navy-900 bg-navy-900 text-white'
                          : 'border-navy-200 bg-white text-navy-500 hover:bg-navy-50'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="h-[360px] w-full bg-navy-50 sm:h-[460px]">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center gap-2 text-[13px] text-navy-400">
                      <Loader2 size={15} className="animate-spin" />
                      지도를 불러오는 중…
                    </div>
                  }
                >
                <StoreRouteMap
                  origin={params.origin}
                  destination={params.destination}
                  route={result?.baseRoute ?? null}
                  candidates={candidates}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  layer={layer}
                />
                </Suspense>
              </div>
              <p className="border-t border-navy-100 px-5 py-3 text-[11.5px] leading-relaxed text-navy-400">
                배경지도: 브이월드(국토교통부 공간정보 오픈플랫폼) WMTS · 경로선: 실제 도로 경로
                (자동차 기준). 브이월드는 길찾기 API를 제공하지 않아 경로는 별도 라우팅 엔진으로
                계산합니다.
              </p>
            </section>

            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}

            {result && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('distance')}
                    className={`btn px-4 py-2.5 ${
                      mode === 'distance'
                        ? 'bg-brand-600 text-white'
                        : 'border border-navy-200 bg-white text-navy-700 hover:bg-navy-50'
                    }`}
                  >
                    <ListOrdered size={15} />
                    거리순 추천
                  </button>
                  <button
                    type="button"
                    onClick={plan ? () => setMode('optimized') : runOptimize}
                    disabled={planning}
                    className={`btn px-4 py-2.5 ${
                      mode === 'optimized'
                        ? 'bg-brand-600 text-white'
                        : 'border border-navy-200 bg-white text-navy-700 hover:bg-navy-50'
                    }`}
                  >
                    {planning ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
                    시간 제약 최적 일정
                  </button>
                  <span className="text-[12px] text-navy-400">
                    {mode === 'distance'
                      ? '가까운 순서를 우선합니다.'
                      : '전체 이동시간과 영업시간을 함께 고려해 방문 순서를 다시 계산했습니다.'}
                  </span>
                </div>

                {mode === 'distance' ? (
                  <RouteResultList result={result} selectedId={selectedId} onSelect={setSelectedId} />
                ) : plan ? (
                  <div className="space-y-5">
                    <Timeline
                      result={plan}
                      origin={params.origin}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                    />
                    <WarningPanel result={plan} />
                  </div>
                ) : null}
              </>
            )}

            {!result && !loading && (
              <div className="card p-10 text-center">
                <MapIcon size={22} className="mx-auto text-brand-500" />
                <p className="mt-3 text-[16px] font-bold text-navy-900">
                  출발지와 도착지를 정하고 검색해 보세요
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-navy-500">
                  예시 경로 버튼을 누르면 바로 시연할 수 있습니다. (진주시청 → 진주성)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
