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

import type { Origin, RouteCandidate, RouteLeg } from '../types';
import { STATUS_META } from '../lib/storeStatus';
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

  return <div ref={containerRef} className="h-full w-full" />;
}
