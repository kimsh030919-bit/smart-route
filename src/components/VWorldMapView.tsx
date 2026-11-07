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
import { defaults as defaultControls } from 'ol/control';
import 'ol/ol.css';

import type { Origin, Stop } from '../types';
import { CATEGORY_META } from '../data/categories';
import { tileUrlTemplate, type VworldLayer } from '../lib/vworld';

interface Props {
  stops: Stop[];
  origin: Origin | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  layer: VworldLayer;
}

/** 브이월드 WMTS 타일 + OpenLayers 로 그리는 지도 */
export function VWorldMapView({ stops, origin, selectedId, onSelect, layer }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const tileRef = useRef<TileLayer<XYZ> | null>(null);
  const routeSourceRef = useRef<VectorSource | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);

  // 지도 생성 (1회)
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
    const route = new VectorLayer({
      source: routeSource,
      style: new Style({ stroke: new Stroke({ color: '#2340e4', width: 4, lineDash: [1, 0] }) }),
    });

    mapRef.current = new Map({
      target: containerRef.current,
      layers: [tile, route],
      controls: defaultControls({ attributionOptions: { collapsible: true } }),
      view: new View({
        center: fromLonLat([origin?.lng ?? 127.0557, origin?.lat ?? 37.5445]),
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

  // 배경지도 레이어 변경
  useEffect(() => {
    tileRef.current?.setSource(
      new XYZ({
        url: tileUrlTemplate(layer),
        crossOrigin: 'anonymous',
        attributions: '© <a href="https://www.vworld.kr" target="_blank" rel="noreferrer">브이월드</a>',
      }),
    );
  }, [layer]);

  // 핀 / 경로 갱신
  useEffect(() => {
    const map = mapRef.current;
    const routeSource = routeSourceRef.current;
    if (!map || !routeSource) return;

    overlaysRef.current.forEach((o) => map.removeOverlay(o));
    overlaysRef.current = [];
    routeSource.clear();

    const coords: [number, number][] = [];
    if (origin) coords.push([origin.lng, origin.lat]);
    stops.forEach((s) => coords.push([s.place.lng, s.place.lat]));
    if (coords.length === 0) return;

    if (origin) {
      const el = document.createElement('div');
      el.style.cssText =
        'display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;background:#1b2b46;' +
        'color:#fff;font-size:11.5px;font-weight:700;white-space:nowrap;transform:translate(-50%,-150%);' +
        'box-shadow:0 6px 16px -6px rgba(16,24,40,.4);';
      el.textContent = `출발 · ${origin.name}`;
      const ov = new Overlay({
        position: fromLonLat([origin.lng, origin.lat]),
        element: el,
        stopEvent: false,
      });
      map.addOverlay(ov);
      overlaysRef.current.push(ov);
    }

    stops.forEach((s) => {
      const selected = selectedId === s.place.id;
      const color = CATEGORY_META[s.place.category].color;
      const el = document.createElement('div');
      el.style.cssText = 'transform:translate(-50%,-100%);cursor:pointer;';
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="display:flex;align-items:center;gap:6px;padding:4px 8px 4px 4px;border-radius:999px;
            background:#fff;border:1.5px solid ${selected ? '#2340e4' : 'rgba(16,24,40,.12)'};
            box-shadow:0 6px 16px -6px rgba(16,24,40,.35);font-size:12px;font-weight:700;color:#1b2b46;
            white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis;">
            <span style="display:flex;width:20px;height:20px;align-items:center;justify-content:center;
              border-radius:999px;background:${color};color:#fff;font-size:11px;">${s.order}</span>
            ${s.place.name}
          </div>
          <div style="width:2px;height:10px;background:${selected ? '#2340e4' : color};"></div>
        </div>`;
      el.addEventListener('click', () => onSelect(s.place.id));
      const ov = new Overlay({
        position: fromLonLat([s.place.lng, s.place.lat]),
        element: el,
        stopEvent: false,
      });
      map.addOverlay(ov);
      overlaysRef.current.push(ov);
    });

    if (coords.length >= 2) {
      const line = new LineString(coords.map((c) => fromLonLat(c)));
      routeSource.addFeature(new Feature(line));
      map.getView().fit(line.getExtent(), {
        padding: [70, 70, 70, 70],
        maxZoom: 16,
        duration: 250,
      });
    } else {
      map.getView().setCenter(fromLonLat(coords[0]));
    }
  }, [stops, origin, selectedId, onSelect]);

  return <div ref={containerRef} className="h-full w-full" />;
}
