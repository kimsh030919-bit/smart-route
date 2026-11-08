import { useEffect, useRef } from 'react';
import type { Origin, Stop } from '../types';
import { CATEGORY_META } from '../data/categories';

interface Props {
  stops: Stop[];
  origin: Origin | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 도로를 따라가는 좌표열. 없으면 지점을 잇는 직선으로 그린다. */
  roadPath?: { lat: number; lng: number }[];
}

function pinHtml(order: number, name: string, color: string, selected: boolean): string {
  return `
  <div style="transform:translateY(-6px);display:flex;flex-direction:column;align-items:center;cursor:pointer;">
    <div style="display:flex;align-items:center;gap:6px;padding:4px 8px 4px 4px;border-radius:999px;
      background:#fff;border:1.5px solid ${selected ? '#ff3366' : 'rgba(16,24,40,.12)'};
      box-shadow:0 6px 16px -6px rgba(16,24,40,.35);font-size:12px;font-weight:700;color:#18181b;
      white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis;">
      <span style="display:flex;width:20px;height:20px;align-items:center;justify-content:center;
        border-radius:999px;background:${color};color:#fff;font-size:11px;">${order}</span>
      ${name}
    </div>
    <div style="width:2px;height:10px;background:${selected ? '#ff3366' : color};"></div>
  </div>`;
}

function originHtml(name: string): string {
  return `
  <div style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;
    background:#18181b;color:#fff;font-size:11.5px;font-weight:700;white-space:nowrap;
    box-shadow:0 6px 16px -6px rgba(16,24,40,.4);">
    <span style="width:6px;height:6px;border-radius:999px;background:#ffb2ba;"></span>출발 · ${name}
  </div>`;
}

export function KakaoMapView({ stops, origin, selectedId, onSelect, roadPath }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const lineRef = useRef<kakao.maps.Polyline | null>(null);

  // 지도 생성
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const k = window.kakao;
    if (!k?.maps?.Map) return;
    const center = stops[0]
      ? new k.maps.LatLng(stops[0].place.lat, stops[0].place.lng)
      : new k.maps.LatLng(origin?.lat ?? 37.5445, origin?.lng ?? 127.0557);
    mapRef.current = new k.maps.Map(containerRef.current, { center, level: 5 });
  }, [origin, stops]);

  // 마커/경로 갱신
  useEffect(() => {
    const k = window.kakao;
    const map = mapRef.current;
    if (!k?.maps || !map) return;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    lineRef.current?.setMap(null);
    lineRef.current = null;

    const bounds = new k.maps.LatLngBounds();
    const path: kakao.maps.LatLng[] = [];

    if (origin) {
      const pos = new k.maps.LatLng(origin.lat, origin.lng);
      bounds.extend(pos);
      path.push(pos);
      const ov = new k.maps.CustomOverlay({
        position: pos,
        content: originHtml(origin.name),
        yAnchor: 1.6,
        zIndex: 2,
      });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    }

    stops.forEach((s) => {
      const pos = new k.maps.LatLng(s.place.lat, s.place.lng);
      bounds.extend(pos);
      path.push(pos);
      const el = document.createElement('div');
      el.innerHTML = pinHtml(
        s.order,
        s.place.name,
        CATEGORY_META[s.place.category].color,
        selectedId === s.place.id,
      );
      el.addEventListener('click', () => onSelect(s.place.id));
      const ov = new k.maps.CustomOverlay({
        position: pos,
        content: el,
        yAnchor: 1,
        zIndex: selectedId === s.place.id ? 10 : 3,
        clickable: true,
      });
      ov.setMap(map);
      overlaysRef.current.push(ov);
    });

    // 도로 경로가 있으면 그대로, 없으면 지점을 잇는 직선으로 폴백
    const linePath =
      roadPath && roadPath.length >= 2
        ? roadPath.map((p) => new k.maps.LatLng(p.lat, p.lng))
        : path;

    if (linePath.length >= 2) {
      lineRef.current = new k.maps.Polyline({
        path: linePath,
        strokeWeight: 4,
        strokeColor: '#ff3366',
        strokeOpacity: 0.75,
        strokeStyle: 'solid',
      });
      lineRef.current.setMap(map);
    }

    if (!bounds.isEmpty()) {
      map.setBounds(bounds, 60, 60);
    }
  }, [stops, origin, selectedId, onSelect, roadPath]);

  return <div ref={containerRef} className="h-full w-full" />;
}
