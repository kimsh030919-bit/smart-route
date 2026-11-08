import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Globe,
  ListOrdered,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Header } from './components/Header';
import { HeroImage } from './components/HeroImage';
import { TripSettingsCard } from './components/TripSettingsCard';
import { PlaceSearchPanel } from './components/PlaceSearchPanel';
import { PlaceCard } from './components/PlaceCard';
import { RouteMap } from './components/RouteMap';
import { SummaryStats } from './components/SummaryStats';
import { Timeline } from './components/Timeline';
import { ComparisonCard } from './components/ComparisonCard';
import { WarningPanel } from './components/WarningPanel';
import { AlternativesCard } from './components/AlternativesCard';
import { Footer } from './components/Footer';
import { useKakaoLoader } from './hooks/useKakaoLoader';
import { optimizeSchedule } from './lib/optimizer';
import { fetchOsmHours } from './lib/osmHours';
import { loadState, saveState } from './lib/storage';
import { toMinutes, todayISO } from './lib/time';
import type { Place, PlaceSearchResult, ScheduleResult, TripSettings } from './types';

const MAX_PLACES = 10;
const MIN_PLACES = 2;

const DEFAULT_SETTINGS: TripSettings = {
  date: todayISO(),
  startTime: '11:00',
  endTime: '21:00',
  mode: 'transit',
  origin: null,
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
  const [osmLoading, setOsmLoading] = useState(false);
  const [osmNotice, setOsmNotice] = useState<{ ok: boolean; text: string } | null>(null);
  /** 실패한 자동 조회를 다시 돌리기 위한 신호 */
  const [osmRetry, setOsmRetry] = useState(0);

  const plannerRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  /** 이미 OpenStreetMap 조회를 시도한 장소 id (같은 장소를 반복 조회하지 않기 위해) */
  const osmTried = useRef<Set<string>>(new Set());

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

  /**
   * 담은 장소들의 **실제 지도 영업시간**을 OpenStreetMap 에서 가져와 덮어쓴다.
   * - API 키가 필요 없고 전국(전 세계) 어디든 동작한다.
   * - OSM 에 영업시간이 등록된 장소만 바꾸고, 없으면 기존 값을 그대로 둔다. (추측하지 않음)
   * - 사용자가 직접 입력한 영업시간(source: 'user')은 덮어쓰지 않는다.
   */
  const loadRealHours = useCallback(async () => {
    const targets = places
      .filter((p) => p.business.source !== 'user')
      .map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng }));

    if (targets.length === 0) {
      setOsmNotice({ ok: false, text: '불러올 장소가 없습니다. (직접 입력한 영업시간은 유지됩니다)' });
      return;
    }

    setOsmLoading(true);
    setOsmNotice(null);
    targets.forEach((t) => osmTried.current.add(t.id));
    try {
      const found = await fetchOsmHours(targets);
      if (found.size === 0) {
        setOsmNotice({
          ok: false,
          text: `${targets.length}곳 모두 OpenStreetMap에 영업시간이 등록되어 있지 않습니다. 기존 정보를 그대로 둡니다.`,
        });
        return;
      }

      setPlaces((prev) =>
        prev.map((p) => {
          const m = found.get(p.id);
          return m ? { ...p, business: m.business } : p;
        }),
      );

      const matches = [...found.values()];
      const names = matches.map((m) => m.osmName);
      const loose = matches.filter((m) => m.looseMatch);
      const missing = targets.length - found.size;
      setOsmNotice({
        ok: true,
        text:
          `${found.size}곳의 실제 영업시간을 반영했습니다 — ${names.slice(0, 3).join(', ')}` +
          `${names.length > 3 ? ` 외 ${names.length - 3}곳` : ''}.` +
          (missing > 0
            ? ` 나머지 ${missing}곳은 지도에 영업시간이 등록되어 있지 않아 그대로 두었습니다.`
            : '') +
          (loose.length > 0
            ? ` 상호 표기가 달라 부분 일치로 찾은 곳이 있습니다 (${loose
                .map((m) => m.osmName)
                .join(', ')}) — 맞는 가게인지 확인해 주세요.`
            : ''),
      });
    } catch (e) {
      setOsmNotice({
        ok: false,
        text: e instanceof Error ? e.message : '영업시간을 불러오지 못했습니다.',
      });
    } finally {
      setOsmLoading(false);
    }
  }, [places]);

  /**
   * 장소를 담으면 **자동으로** 실제 지도 영업시간을 채운다.
   * 연속으로 담을 때 공개 서버를 두드리지 않도록 잠깐 모았다가 한 번에 조회한다.
   */
  useEffect(() => {
    const fresh = places.filter(
      (p) =>
        !osmTried.current.has(p.id) &&
        p.business.source !== 'user' &&
        p.business.source !== 'osm',
    );
    if (fresh.length === 0) return;

    const timer = window.setTimeout(async () => {
      // 먼저 표시해 두어 같은 장소로 반복 호출되지 않게 한다
      fresh.forEach((p) => osmTried.current.add(p.id));
      try {
        const found = await fetchOsmHours(
          fresh.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng })),
        );
        if (found.size === 0) return;
        setPlaces((prev) =>
          prev.map((p) => {
            const m = found.get(p.id);
            // 그 사이 사용자가 직접 입력했다면 덮어쓰지 않는다
            return m && p.business.source !== 'user' ? { ...p, business: m.business } : p;
          }),
        );
        const matches = [...found.values()];
        const loose = matches.filter((m) => m.looseMatch);
        setOsmNotice({
          ok: true,
          text:
            `${matches.map((m) => m.osmName).join(', ')} — 지도에 등록된 실제 영업시간을 자동으로 채웠습니다.` +
            (loose.length > 0
              ? ` 상호 표기가 달라 부분 일치로 찾은 곳이 있습니다 (${loose
                  .map((m) => m.osmName)
                  .join(', ')}) — 맞는 가게인지 확인해 주세요.`
              : ''),
        });
      } catch (e) {
        // 공개 Overpass 서버는 간헐적으로 혼잡(429)하다.
        // 조용히 넘기면 영업시간이 채워지지 않은 이유를 알 수 없으므로,
        // 실패를 알리고 잠시 뒤 **자동으로 한 번 더** 시도한다.
        setOsmNotice({
          ok: false,
          text: `${
            e instanceof Error ? e.message : '영업시간을 불러오지 못했습니다.'
          } 잠시 후 자동으로 다시 시도합니다. (바로 시도하려면 "실제 영업시간 불러오기"를 누르세요)`,
        });
        window.setTimeout(() => {
          fresh.forEach((p) => osmTried.current.delete(p.id));
          setOsmRetry((n) => n + 1);
        }, 12000);
      }
    }, 900);

    return () => window.clearTimeout(timer);
    // osmRetry 가 바뀌면 실패했던 장소를 다시 조회한다
  }, [places, osmRetry]);

  const calculate = useCallback(
    (placesOverride?: Place[]) => {
    const target = placesOverride ?? places;
    setError(null);
    if (target.length < MIN_PLACES) {
      setError(`장소를 최소 ${MIN_PLACES}곳 이상 추가해 주세요. (현재 ${target.length}곳)`);
      return;
    }
    if (target.length > MAX_PLACES) {
      setError(`장소는 최대 ${MAX_PLACES}곳까지 계산할 수 있습니다.`);
      return;
    }
    // 종료 시간이 출발 시간보다 빠르면 어떤 일정도 만들 수 없다 (조용히 전부 제외되는 것을 막는다)
    const startMin = toMinutes(settings.startTime);
    const endMin = toMinutes(settings.endTime);
    if (startMin !== null && endMin !== null && endMin <= startMin) {
      setError(
        `희망 종료 시간(${settings.endTime})이 출발 시간(${settings.startTime})보다 빠릅니다. 종료 시간을 늦춰 주세요.`,
      );
      return;
    }
    setCalculating(true);
    // UI가 로딩 상태를 그릴 수 있도록 다음 프레임에 계산
    window.setTimeout(() => {
      try {
        const res = optimizeSchedule(target, settings, { fixedOrder });
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
    },
    [places, settings, fixedOrder],
  );

  /** 문 닫은 장소를 주변 대체 장소로 바꾸고 바로 다시 계산 */
  const replaceWithAlternative = useCallback(
    (oldPlaceId: string, next: Place) => {
      const updated = places.map((p) => (p.id === oldPlaceId ? next : p));
      // 이미 담겨 있는 장소로 교체하려는 경우엔 중복을 제거한다
      const deduped = updated.filter(
        (p, i) => updated.findIndex((o) => o.id === p.id) === i,
      );
      setPlaces(deduped);
      calculate(deduped);
    },
    [places, calculate],
  );

  return (
    <div className="min-h-screen bg-white">
      <Header kakaoStatus={kakaoStatus} onStart={() => scrollTo(plannerRef)} />
      <main>
        <HeroImage />

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
                {kakaoError} 브이월드 지도와 검색으로 모든 기능을 그대로 사용할 수 있습니다.
              </p>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="space-y-6">
                <TripSettingsCard settings={settings} onChange={setSettings} kakaoReady={kakaoReady} />
                <PlaceSearchPanel
                  date={settings.date}
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
                    <div className="flex items-center gap-1">
                      {places.length > 0 && (
                        <button
                          type="button"
                          className="btn-ghost text-[12.5px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                          onClick={loadRealHours}
                          disabled={osmLoading}
                          title="OpenStreetMap에 등록된 실제 영업시간을 가져옵니다 (전국, API 키 불필요)"
                        >
                          {osmLoading ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Globe size={13} />
                          )}
                          {osmLoading ? '불러오는 중…' : '실제 영업시간 불러오기'}
                        </button>
                      )}
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
                  </div>

                  {osmNotice && (
                    <p
                      className={`mt-3 flex items-start gap-2 rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed ${
                        osmNotice.ok
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                          : 'border-amber-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      {osmNotice.ok ? (
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      )}
                      <span>
                        {osmNotice.text}
                        <span className="mt-0.5 block text-[11.5px] opacity-80">
                          출처: OpenStreetMap (커뮤니티가 등록한 실제 영업시간). 라스트 오더와 임시
                          휴무는 제공되지 않아 직접 입력해야 합니다.
                        </span>
                      </span>
                    </p>
                  )}

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
                    onClick={() => calculate()}
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
                  <button type="button" onClick={() => calculate()} className="btn-secondary py-3">
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
                      {result.excluded.length > 0 && (
                        <AlternativesCard
                          excluded={result.excluded}
                          onReplace={replaceWithAlternative}
                        />
                      )}
                      <WarningPanel result={result} />
                    </div>
                  </div>
                )}

                {result.stops.length === 0 && (
                  <>
                    {result.excluded.length > 0 && (
                      <AlternativesCard
                        excluded={result.excluded}
                        onReplace={replaceWithAlternative}
                      />
                    )}
                    <WarningPanel result={result} />
                  </>
                )}

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
