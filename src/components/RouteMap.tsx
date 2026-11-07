import { Suspense, lazy, useMemo, useState } from 'react';
import { Clock, Coffee, Info, Layers, Loader2, MapPin, Route, Timer, X } from 'lucide-react';
import type { Origin, Stop, TransportMode } from '../types';
import { KakaoMapView } from './KakaoMapView';
import { DemoMapView } from './DemoMapView';
import { CATEGORY_META } from '../data/categories';
import { breaksSummary, closedDaysSummary, hoursSummary } from '../lib/businessHours';
import { formatClock, formatDuration } from '../lib/time';
import { MODE_SPECS } from '../lib/travel';
import { VWORLD_LAYERS, hasVworldKey, type VworldLayer } from '../lib/vworld';

// 브이월드 지도는 OpenLayers를 쓰므로, 실제로 선택했을 때만 내려받도록 분리한다.
const VWorldMapView = lazy(() =>
  import('./VWorldMapView').then((m) => ({ default: m.VWorldMapView })),
);

export type MapProvider = 'vworld' | 'kakao' | 'demo';

const PROVIDER_LABELS: Record<MapProvider, string> = {
  vworld: '브이월드',
  kakao: '카카오맵',
  demo: '데모 지도',
};

interface Props {
  stops: Stop[];
  origin: Origin | null;
  mode: TransportMode;
  totalDistanceKm: number;
  totalTravelMinutes: number;
  kakaoReady: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function RouteMap({
  stops,
  origin,
  mode,
  totalDistanceKm,
  totalTravelMinutes,
  kakaoReady,
  selectedId,
  onSelect,
}: Props) {
  const providers = useMemo<MapProvider[]>(() => {
    const out: MapProvider[] = [];
    if (hasVworldKey()) out.push('vworld');
    if (kakaoReady) out.push('kakao');
    out.push('demo');
    return out;
  }, [kakaoReady]);

  const [provider, setProvider] = useState<MapProvider>(providers[0]);
  const [layer, setLayer] = useState<VworldLayer>('Base');
  const active: MapProvider = providers.includes(provider) ? provider : providers[0];
  const selected = stops.find((s) => s.place.id === selectedId) ?? null;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-100 px-5 py-4">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
          <Route size={17} className="text-brand-600" />
          전체 경로 지도
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-navy-600">
          <span className="chip bg-navy-50 text-navy-700">
            총 이동거리 {totalDistanceKm.toFixed(1)}km
          </span>
          <span className="chip bg-navy-50 text-navy-700">
            총 이동시간 {formatDuration(totalTravelMinutes)}
          </span>
          <span className="chip bg-navy-50 text-navy-700">{MODE_SPECS[mode].label}</span>
        </div>
      </div>

      {/* 지도 소스 선택 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 px-5 py-3">
        <span className="flex items-center gap-1 text-[12px] font-semibold text-navy-400">
          <Layers size={13} />
          지도 소스
        </span>
        {providers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setProvider(p)}
            className={`chip border transition-colors ${
              active === p
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-navy-200 bg-white text-navy-600 hover:bg-navy-50'
            }`}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}

        {active === 'vworld' && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {VWORLD_LAYERS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLayer(l.key)}
                className={`chip border transition-colors ${
                  layer === l.key
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : 'border-navy-200 bg-white text-navy-500 hover:bg-navy-50'
                }`}
              >
                {l.label}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className="relative h-[340px] w-full bg-navy-50 sm:h-[460px]">
        {active === 'vworld' ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-2 text-[13px] text-navy-400">
                <Loader2 size={15} className="animate-spin" />
                브이월드 지도를 불러오는 중…
              </div>
            }
          >
            <VWorldMapView
              stops={stops}
              origin={origin}
              selectedId={selectedId}
              onSelect={(id) => onSelect(id)}
              layer={layer}
            />
          </Suspense>
        ) : active === 'kakao' ? (
          <KakaoMapView
            stops={stops}
            origin={origin}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id)}
          />
        ) : (
          <DemoMapView
            stops={stops}
            origin={origin}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id)}
          />
        )}

        {/* 선택한 장소 상세정보 */}
        {selected && (
          <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-navy-100 bg-white/97 p-4 shadow-pop sm:right-auto sm:w-[22rem]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-1.5 text-[14.5px] font-bold text-navy-900">
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-600 text-[11px] text-white">
                    {selected.order}
                  </span>
                  {selected.place.name}
                  <span className={`chip ${CATEGORY_META[selected.place.category].bg}`}>
                    {CATEGORY_META[selected.place.category].label}
                  </span>
                </p>
                <p className="mt-1 flex items-center gap-1 text-[12px] text-navy-400">
                  <MapPin size={11} />
                  {selected.place.address}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost px-1.5 py-1"
                onClick={() => onSelect(null)}
                aria-label="닫기"
              >
                <X size={15} />
              </button>
            </div>

            <dl className="mt-3 space-y-1.5 text-[12.5px]">
              <div className="flex items-center gap-1.5 text-navy-600">
                <Clock size={12} className="text-brand-600" />
                <dt className="font-semibold">도착/이용</dt>
                <dd className="tnum">
                  {formatClock(selected.arrival)} 도착 · {formatClock(selected.start)}~
                  {formatClock(selected.end)} 이용
                </dd>
              </div>
              <div className="flex items-center gap-1.5 text-navy-600">
                <Timer size={12} className="text-brand-600" />
                <dt className="font-semibold">체류</dt>
                <dd>{formatDuration(selected.end - selected.start)}</dd>
              </div>
              <div className="flex items-center gap-1.5 text-navy-600">
                <Clock size={12} className="text-navy-400" />
                <dt className="font-semibold">영업</dt>
                <dd>
                  {hoursSummary(selected.place.business)} · {closedDaysSummary(selected.place.business)}
                </dd>
              </div>
              <div className="flex items-center gap-1.5 text-navy-600">
                <Coffee size={12} className="text-navy-400" />
                <dt className="font-semibold">브레이크</dt>
                <dd>{breaksSummary(selected.place.business)}</dd>
              </div>
            </dl>

            {selected.flags.breakAvoided && (
              <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-brand-50 px-2.5 py-2 text-[12px] leading-relaxed text-brand-800">
                <Info size={12} className="mt-0.5 shrink-0" />
                브레이크 타임을 피해 이용 시작을 {formatClock(selected.start)}로 조정했습니다.
              </p>
            )}
            {selected.flags.unverified && (
              <p className="mt-2.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] leading-relaxed text-amber-800">
                영업정보가 확인되지 않은 장소입니다. 방문 전 직접 확인해 주세요.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="border-t border-navy-100 px-5 py-3 text-[11.5px] leading-relaxed text-navy-400">
        {active === 'vworld' &&
          '배경지도는 브이월드(국토교통부 공간정보 오픈플랫폼) WMTS 타일입니다. 경로선은 번호 순서를 잇는 직선이며 실제 도로 경로가 아닙니다.'}
        {active === 'kakao' &&
          '지도는 카카오맵 API로 표시됩니다. 경로선은 번호 순서를 잇는 직선이며 실제 도로 경로가 아닙니다.'}
        {active === 'demo' &&
          '지도 API 키가 없어 데모 지도(좌표 개념도)로 표시합니다. 브이월드 또는 카카오맵 키를 설정하면 실제 지도로 전환됩니다.'}
      </p>
    </section>
  );
}
