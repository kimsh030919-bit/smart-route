import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ListOrdered,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { TripSettingsCard } from './components/TripSettingsCard';
import { PlaceSearchPanel } from './components/PlaceSearchPanel';
import { PlaceCard } from './components/PlaceCard';
import { RouteMap } from './components/RouteMap';
import { SummaryStats } from './components/SummaryStats';
import { Timeline } from './components/Timeline';
import { ComparisonCard } from './components/ComparisonCard';
import { WarningPanel } from './components/WarningPanel';
import { Footer } from './components/Footer';
import { useKakaoLoader } from './hooks/useKakaoLoader';
import { DEMO_ORIGINS, DEMO_PLACES, nextDateForWeekday, type DemoScenario } from './data/demoPlaces';
import { optimizeSchedule } from './lib/optimizer';
import { loadState, saveState } from './lib/storage';
import { todayISO } from './lib/time';
import type { Place, PlaceSearchResult, ScheduleResult, TripSettings } from './types';

const MAX_PLACES = 10;
const MIN_PLACES = 2;

const DEFAULT_SETTINGS: TripSettings = {
  date: todayISO(),
  startTime: '11:00',
  endTime: '21:00',
  mode: 'transit',
  origin: DEMO_ORIGINS[0],
};

function toPlace(r: PlaceSearchResult): Place {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    stayMinutes: r.defaultStayMinutes,
    priority: 'normal',
    business: { ...r.business, breaks: r.business.breaks.map((b) => ({ ...b })) },
    isDemo: r.isDemo,
  };
}

export default function App() {
  const { status: kakaoStatus, error: kakaoError } = useKakaoLoader();
  const kakaoReady = kakaoStatus === 'ready';

  const persisted = useMemo(() => loadState(), []);
  const [places, setPlaces] = useState<Place[]>(persisted?.places ?? []);
  const [settings, setSettings] = useState<TripSettings>(persisted?.settings ?? DEFAULT_SETTINGS);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fixedOrder, setFixedOrder] = useState(false);
  const [stale, setStale] = useState(false);

  const plannerRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveState({ places, settings });
  }, [places, settings]);

  // 조건이 바뀌면 "다시 계산 필요" 표시
  useEffect(() => {
    if (result) setStale(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, settings, fixedOrder]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const addPlace = useCallback((r: PlaceSearchResult) => {
    setError(null);
    setPlaces((prev) => {
      if (prev.length >= MAX_PLACES) return prev;
      if (prev.some((p) => p.id === r.id)) return prev;
      return [...prev, toPlace(r)];
    });
  }, []);

  const updatePlace = useCallback((id: string, patch: Partial<Place>) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const removePlace = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const movePlace = useCallback((index: number, dir: -1 | 1) => {
    setPlaces((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const calculate = useCallback(() => {
    setError(null);
    if (places.length < MIN_PLACES) {
      setError(`장소를 최소 ${MIN_PLACES}곳 이상 추가해 주세요. (현재 ${places.length}곳)`);
      return;
    }
    if (places.length > MAX_PLACES) {
      setError(`장소는 최대 ${MAX_PLACES}곳까지 계산할 수 있습니다.`);
      return;
    }
    setCalculating(true);
    // UI가 로딩 상태를 그릴 수 있도록 다음 프레임에 계산
    window.setTimeout(() => {
      try {
        const res = optimizeSchedule(places, settings, { fixedOrder });
        setResult(res);
        setStale(false);
        setSelectedId(null);
        if (res.stops.length === 0) {
          setError(
            '조건을 만족하는 일정을 만들 수 없었습니다. 아래 안내된 이유와 대안을 확인해 주세요.',
          );
        }
        window.setTimeout(() => scrollTo(resultRef), 50);
      } catch (e) {
        setResult(null);
        setError(
          e instanceof Error
            ? `동선 계산 중 오류가 발생했습니다: ${e.message}`
            : '동선 계산 중 알 수 없는 오류가 발생했습니다.',
        );
      } finally {
        setCalculating(false);
      }
    }, 30);
  }, [places, settings, fixedOrder]);

  const applyScenario = useCallback((s: DemoScenario) => {
    const picked = s.placeIds
      .map((id) => DEMO_PLACES.find((p) => p.id === id))
      .filter((p): p is PlaceSearchResult => !!p)
      .map(toPlace);
    setPlaces(picked);
    setSettings({
      date: nextDateForWeekday(s.weekday),
      startTime: s.startTime,
      endTime: s.endTime,
      mode: s.mode,
      origin: DEMO_ORIGINS[s.originIndex] ?? DEMO_ORIGINS[0],
    });
    setFixedOrder(false);
    setResult(null);
    setError(null);
    setTimeout(() => scrollTo(plannerRef), 50);
  }, []);

  const quickDemo = useCallback(() => {
    applyScenario({
      id: 'breaktime',
      title: '',
      description: '',
      placeIds: ['demo-cafe-a', 'demo-food-b', 'demo-attraction-c', 'demo-park-e'],
      originIndex: 0,
      startTime: '11:00',
      endTime: '21:00',
      mode: 'transit',
      weekday: 6,
    });
  }, [applyScenario]);

  return (
    <div className="min-h-screen bg-white">
      <Header kakaoStatus={kakaoStatus} onStart={() => scrollTo(plannerRef)} />
      <main>
        <Hero onStart={() => scrollTo(plannerRef)} onDemo={quickDemo} />
        <Features />

        <section ref={plannerRef} id="planner" className="scroll-mt-20 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 className="text-[26px] font-extrabold tracking-tight text-navy-900 sm:text-[30px]">
              나만의 일정 만들기
            </h2>
            <p className="mt-2.5 text-[15px] text-navy-500">
              출발 조건을 정하고 가고 싶은 장소를 담으면, 영업시간과 브레이크 타임을 지키는 순서를
              계산해 드립니다.
            </p>

            {kakaoStatus === 'error' && kakaoError && (
              <p className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {kakaoError} 지금은 데모 지도와 데모 장소 데이터로 모든 기능을 사용할 수 있습니다.
              </p>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <TripSettingsCard settings={settings} onChange={setSettings} kakaoReady={kakaoReady} />
                <PlaceSearchPanel
                  origin={settings.origin}
                  kakaoReady={kakaoReady}
                  addedIds={places.map((p) => p.id)}
                  full={places.length >= MAX_PLACES}
                  onAdd={addPlace}
                />
              </div>

              <div className="space-y-6">
                <section className="card p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
                      <ListOrdered size={17} className="text-brand-600" />
                      방문 장소 목록
                      <span className="chip bg-navy-100 text-navy-600">
                        {places.length} / {MAX_PLACES}
                      </span>
                    </h3>
                    {places.length > 0 && (
                      <button
                        type="button"
                        className="btn-ghost text-[12.5px]"
                        onClick={() => {
                          setPlaces([]);
                          setResult(null);
                        }}
                      >
                        <Trash2 size={13} />
                        전체 삭제
                      </button>
                    )}
                  </div>

                  {places.length === 0 ? (
                    <p className="mt-4 rounded-xl border border-dashed border-navy-200 bg-navy-50/60 px-4 py-8 text-center text-[13.5px] leading-relaxed text-navy-500">
                      아직 추가한 장소가 없습니다.
                      <br />
                      왼쪽에서 장소를 검색해 최소 {MIN_PLACES}곳 이상 담아 주세요.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {places.map((p, i) => (
                        <li key={p.id} className="relative">
                          <PlaceCard
                            place={p}
                            index={i}
                            date={settings.date}
                            onUpdate={(patch) => updatePlace(p.id, patch)}
                            onRemove={() => removePlace(p.id)}
                          />
                          {fixedOrder && (
                            <div className="absolute right-11 top-3 flex gap-1">
                              <button
                                type="button"
                                className="btn-ghost px-1.5 py-1"
                                onClick={() => movePlace(i, -1)}
                                disabled={i === 0}
                                aria-label="순서 올리기"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                className="btn-ghost px-1.5 py-1"
                                onClick={() => movePlace(i, 1)}
                                disabled={i === places.length - 1}
                                aria-label="순서 내리기"
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  <label className="mt-4 flex items-start gap-2 rounded-xl bg-navy-50 px-3.5 py-3 text-[13px] text-navy-700">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                      checked={fixedOrder}
                      onChange={(e) => setFixedOrder(e.target.checked)}
                    />
                    <span>
                      <strong className="font-semibold">내가 정한 순서로 계산</strong>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-navy-500">
                        켜면 위 목록 순서를 그대로 따르고, 영업시간·브레이크 타임만 검증합니다. (순서
                        변경 버튼이 나타납니다)
                      </span>
                    </span>
                  </label>

                  {error && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-rose-700">
                      <AlertCircle size={15} className="mt-0.5 shrink-0" />
                      {error}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={calculate}
                    disabled={calculating}
                    className="btn-primary mt-4 w-full py-3.5 text-[16px]"
                  >
                    {calculating ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Wand2 size={18} />
                    )}
                    {calculating ? '최적 동선 계산 중…' : '최적 동선 만들기'}
                  </button>

                  {stale && result && (
                    <p className="mt-2.5 text-center text-[12.5px] font-semibold text-amber-700">
                      조건이 변경되었습니다. 다시 계산해 주세요.
                    </p>
                  )}
                </section>
              </div>
            </div>
          </div>
        </section>

        {/* 결과 */}
        <section ref={resultRef} id="result" className="scroll-mt-20 border-t border-navy-100 bg-navy-50/50">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            {!result ? (
              <div className="card p-10 text-center">
                <Sparkles size={22} className="mx-auto text-brand-500" />
                <p className="mt-3 text-[16px] font-bold text-navy-900">
                  아직 생성된 일정이 없습니다
                </p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-navy-500">
                  장소를 {MIN_PLACES}곳 이상 담고 <strong>최적 동선 만들기</strong>를 누르면 지도와
                  타임라인이 함께 생성됩니다.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[26px] font-extrabold tracking-tight text-navy-900 sm:text-[30px]">
                      최적화된 하루 일정
                    </h2>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[13.5px] text-navy-500">
                      {result.feasible ? (
                        <span className="chip bg-emerald-50 text-emerald-700">
                          <CheckCircle2 size={12} />
                          입력한 {result.stops.length}곳 모두 방문 가능
                        </span>
                      ) : (
                        <span className="chip bg-amber-50 text-amber-800">
                          <AlertCircle size={12} />
                          {result.stops.length}곳만 방문 가능 · {result.excluded.length}곳 제외
                        </span>
                      )}
                      {fixedOrder && (
                        <span className="chip bg-navy-100 text-navy-600">사용자 지정 순서 검증</span>
                      )}
                    </p>
                  </div>
                  <button type="button" onClick={calculate} className="btn-secondary py-3">
                    <RefreshCw size={16} />
                    일정 다시 계산하기
                  </button>
                </div>

                {result.stops.length > 0 && <SummaryStats result={result} />}

                {result.stops.length > 0 && (
                  <RouteMap
                    stops={result.stops}
                    origin={settings.origin}
                    mode={result.mode}
                    totalDistanceKm={result.totalDistanceKm}
                    totalTravelMinutes={result.totalTravelMinutes}
                    kakaoReady={kakaoReady}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                )}

                {result.stops.length > 0 && (
                  <div className="grid gap-6 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      <Timeline
                        result={result}
                        origin={settings.origin}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                      />
                    </div>
                    <div className="space-y-6 lg:col-span-2">
                      <WarningPanel result={result} />
                    </div>
                  </div>
                )}

                {result.stops.length === 0 && <WarningPanel result={result} />}

                <ComparisonCard result={result} />
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
