import { useEffect, useRef } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Overlay from 'ol/Overlay';
import { Stroke, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import 'ol/ol.css';

import { X } from 'lucide-react';
import type { Origin, RouteCandidate, RouteLeg } from '../types';
import { STATUS_META } from '../lib/storeStatus';
import { CATEGORY_META } from '../data/categories';
import { breaksSummary, closedDaysSummary, hoursSummary } from '../lib/businessHours';
import { formatClock, formatDuration } from '../lib/time';
import { tileUrlTemplate, hasVworldKey, type VworldLayer } from '../lib/vworld';

interface Props {
  origin: Origin | null;
  destination: Origin | null;
  route: RouteLeg | null;
  candidates: RouteCandidate[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  layer: VworldLayer;
}

function endpointHtml(label: string, name: string, color: string): string {
  return `
  <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;">
    <div style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;background:${color};
      color:#fff;font-size:11.5px;font-weight:800;white-space:nowrap;box-shadow:0 6px 16px -6px rgba(16,24,40,.45);">
      ${label} · ${name}
    </div>
    <div style="width:2px;height:10px;background:${color};"></div>
  </div>`;
}

function storeHtml(c: RouteCandidate, selected: boolean): string {
  const meta = STATUS_META[c.evaluation.status];
  const badge = c.order ? String(c.order) : '·';
  return `
  <div style="transform:translate(-50%,-100%);cursor:pointer;display:flex;flex-direction:column;align-items:center;">
    <div style="display:flex;align-items:center;gap:6px;padding:4px 9px 4px 4px;border-radius:999px;background:#fff;
      border:${selected ? '2px solid #2340e4' : '1.5px solid rgba(16,24,40,.14)'};
      box-shadow:0 6px 16px -6px rgba(16,24,40,.35);font-size:11.5px;font-weight:700;color:#1b2b46;
      white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis;">
      <span style="display:flex;width:19px;height:19px;align-items:center;justify-content:center;border-radius:999px;
        background:${meta.marker};color:#fff;font-size:11px;">${badge}</span>
      ${c.store.name}
      <span style="color:${meta.marker};font-weight:800;">${meta.label}</span>
    </div>
    <div style="width:2px;height:9px;background:${meta.marker};"></div>
  </div>`;
}

/** 브이월드 배경지도 + 실제 경로 + 상태별 가게 마커 */
export function StoreRouteMap({
  origin,
  destination,
  route,
  candidates,
  selectedId,
  onSelect,
  layer,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const tileRef = useRef<TileLayer<XYZ> | null>(null);
  const routeSourceRef = useRef<VectorSource | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const popupRef = useRef<HTMLDivElement>(null);
  const popupOverlayRef = useRef<Overlay | null>(null);

  const selected = candidates.find((c) => c.store.id === selectedId) ?? null;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const tile = new TileLayer({
      source: new XYZ({
        url: tileUrlTemplate(layer),
        crossOrigin: 'anonymous',
        attributions: '© <a href="https://www.vworld.kr" target="_blank" rel="noreferrer">브이월드</a>',
      }),
    });
    const routeSource = new VectorSource();
    mapRef.current = new Map({
      target: containerRef.current,
      layers: [
        tile,
        new VectorLayer({
          source: routeSource,
          style: new Style({ stroke: new Stroke({ color: '#2340e4', width: 5 }) }),
        }),
      ],
      view: new View({
        center: fromLonLat([origin?.lng ?? 128.1087, origin?.lat ?? 35.1803]),
        zoom: 13,
        minZoom: 6,
        maxZoom: 18,
      }),
    });
    tileRef.current = tile;
    routeSourceRef.current = routeSource;

    // 말풍선 팝업 (선택한 장소 위에 표시)
    if (popupRef.current) {
      popupOverlayRef.current = new Overlay({
        element: popupRef.current,
        positioning: 'bottom-center',
        offset: [0, -34],
        stopEvent: true,
        // 말풍선이 지도 밖으로 잘리면 지도를 밀어서 전체가 보이게 한다
        autoPan: { animation: { duration: 250 }, margin: 24 },
      });
      mapRef.current.addOverlay(popupOverlayRef.current);
    }

    return () => {
      mapRef.current?.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    tileRef.current?.setSource(
      new XYZ({
        url: tileUrlTemplate(layer),
        crossOrigin: 'anonymous',
        attributions: '© <a href="https://www.vworld.kr" target="_blank" rel="noreferrer">브이월드</a>',
      }),
    );
  }, [layer]);

  useEffect(() => {
    const map = mapRef.current;
    const routeSource = routeSourceRef.current;
    if (!map || !routeSource) return;

    overlaysRef.current.forEach((o) => map.removeOverlay(o));
    overlaysRef.current = [];
    routeSource.clear();

    const addOverlay = (lng: number, lat: number, html: string, onClick?: () => void) => {
      const el = document.createElement('div');
      el.innerHTML = html;
      if (onClick) el.addEventListener('click', onClick);
      const ov = new Overlay({ position: fromLonLat([lng, lat]), element: el, stopEvent: false });
      map.addOverlay(ov);
      overlaysRef.current.push(ov);
    };

    if (route && route.geometry.length >= 2) {
      const line = new LineString(route.geometry.map((p) => fromLonLat([p.lng, p.lat])));
      routeSource.addFeature(new Feature(line));
      map.getView().fit(line.getExtent(), { padding: [80, 80, 80, 80], maxZoom: 16, duration: 250 });
    } else if (origin) {
      map.getView().setCenter(fromLonLat([origin.lng, origin.lat]));
    }

    if (origin) addOverlay(origin.lng, origin.lat, endpointHtml('출발', origin.name, '#059669'));
    if (destination)
      addOverlay(destination.lng, destination.lat, endpointHtml('도착', destination.name, '#e11d48'));

    candidates.forEach((c) => {
      addOverlay(c.store.lng, c.store.lat, storeHtml(c, selectedId === c.store.id), () =>
        onSelect(c.store.id),
      );
    });
  }, [route, origin, destination, candidates, selectedId, onSelect]);

  // 선택된 장소 위로 말풍선 이동 / 숨김
  useEffect(() => {
    const ov = popupOverlayRef.current;
    if (!ov) return;
    if (selected) {
      // 위치를 먼저 비워야 autoPan이 새 위치 기준으로 다시 계산된다
      ov.setPosition(undefined);
      ov.setPosition(fromLonLat([selected.store.lng, selected.store.lat]));
    } else {
      ov.setPosition(undefined);
    }
  }, [selected]);

  if (!hasVworldKey()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[13px] text-navy-500">
        <p className="font-semibold text-navy-700">브이월드 지도 키가 설정되지 않았습니다.</p>
        <p className="leading-relaxed">
          <code className="rounded bg-navy-100 px-1">VITE_VWORLD_API_KEY</code> 를 설정하면 지도가
          표시됩니다. 키가 없어도 추천 목록과 영업시간 판정은 그대로 동작합니다.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* 말풍선 팝업 — OpenLayers Overlay가 위치를 잡고, 내용은 React가 그린다 */}
      <div ref={popupRef} className={selected ? 'block' : 'hidden'}>
        {selected && <StorePopup c={selected} onClose={() => onSelect(null)} />}
      </div>
    </div>
  );
}

/** 지도 마커 클릭 시 뜨는 말풍선 */
function StorePopup({ c, onClose }: { c: RouteCandidate; onClose: () => void }) {
  const meta = CATEGORY_META[c.store.category];
  const status = STATUS_META[c.evaluation.status];
  const Icon = meta.icon;
  const dist = c.travelKm < 1 ? `${Math.round(c.travelKm * 1000)}m` : `${c.travelKm.toFixed(1)}km`;

  return (
    <div className="relative w-[278px] -translate-x-1/2">
      <div className="rounded-2xl border border-navy-200 bg-white p-3.5 shadow-pop">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-extrabold text-navy-900">
              {c.order && (
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-white"
                  style={{ background: status.marker }}
                >
                  {c.order}
                </span>
              )}
              <span className={`flex h-5 w-5 items-center justify-center rounded-md ${meta.bg}`}>
                <Icon size={11} />
              </span>
              {c.store.name}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1">
              <span className={`chip ${meta.bg}`}>{meta.label}</span>
              <span className={`chip ${status.chip}`}>{status.label}</span>
              {c.store.dataKind === 'demo' && (
                <span className="chip bg-navy-100 text-navy-600">데모</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost shrink-0 px-1.5 py-1"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>

        <p className="mt-2 text-[11.5px] leading-relaxed text-navy-400">{c.store.address}</p>

        <dl className="mt-2 space-y-1 text-[12px] text-navy-600">
          <div className="flex justify-between gap-2">
            <dt className="text-navy-400">영업시간</dt>
            <dd className="text-right font-semibold">{hoursSummary(c.store.business)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-navy-400">휴무일</dt>
            <dd className="text-right font-semibold">{closedDaysSummary(c.store.business)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-navy-400">브레이크</dt>
            <dd className="text-right font-semibold">
              {c.store.business.breaks.length > 0 ? breaksSummary(c.store.business) : '정보 없음'}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-navy-400">출발지에서</dt>
            <dd className="tnum text-right font-semibold">
              {dist} · {formatDuration(c.travelMin)}
              <span className="ml-1 font-normal text-navy-400">
                ({c.realRoad ? '실제 도로' : '직선 추정'})
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-navy-400">도착 예정</dt>
            <dd className="tnum text-right font-semibold">{formatClock(c.arrivalMinutes)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-navy-400">예상 체류</dt>
            <dd className="text-right font-semibold">{formatDuration(c.store.stayMinutes)}</dd>
          </div>
        </dl>

        <p className={`mt-2 rounded-lg px-2.5 py-2 text-[11.5px] leading-relaxed ${status.chip}`}>
          {c.evaluation.detail}
        </p>

        <p className="mt-1.5 text-[10.5px] text-navy-400">
          {c.store.verifiedAt ? `정보 최종 확인 ${c.store.verifiedAt}` : '최종 확인일 미등록'}
        </p>
      </div>

      {/* 말풍선 꼬리 */}
      <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-8 border-t-[10px] border-x-transparent border-t-navy-200" />
      <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[9px] border-x-transparent border-t-white" />
    </div>
  );
}
