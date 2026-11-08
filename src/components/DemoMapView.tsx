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

const W = 800;
const H = 520;
const PAD = 70;

/** 위경도 -> 평면 km (서울 위도 기준 근사) */
function toPlane(lat: number, lng: number) {
  return { x: lng * 88.2, y: -lat * 111 };
}

/**
 * 지도 API 키가 없을 때 사용하는 데모 지도.
 * 실제 지도 타일이 아니라 좌표를 평면에 투영한 개념도이며, 화면에도 그렇게 표시한다.
 */
export function DemoMapView({ stops, origin, selectedId, onSelect, roadPath }: Props) {
  const nodes = [
    ...(origin ? [{ id: '__origin__', lat: origin.lat, lng: origin.lng }] : []),
    ...stops.map((s) => ({ id: s.place.id, lat: s.place.lat, lng: s.place.lng })),
    // 도로 경로가 화면 밖으로 나가지 않도록 경계 계산에 포함
    ...(roadPath ?? []).map((p, i) => ({ id: `__road${i}__`, lat: p.lat, lng: p.lng })),
  ];

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-navy-400">
        장소를 추가하고 동선을 계산하면 지도가 표시됩니다.
      </div>
    );
  }

  const planes = nodes.map((n) => toPlane(n.lat, n.lng));
  const minX = Math.min(...planes.map((p) => p.x));
  const maxX = Math.max(...planes.map((p) => p.x));
  const minY = Math.min(...planes.map((p) => p.y));
  const maxY = Math.max(...planes.map((p) => p.y));
  const spanX = Math.max(maxX - minX, 0.3);
  const spanY = Math.max(maxY - minY, 0.3);
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offsetX = (W - spanX * scale) / 2;
  const offsetY = (H - spanY * scale) / 2;

  const project = (lat: number, lng: number) => {
    const p = toPlane(lat, lng);
    return {
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + (p.y - minY) * scale,
    };
  };

  const points = [
    ...(origin ? [{ ...project(origin.lat, origin.lng), label: '출발', id: '__origin__' }] : []),
    ...stops.map((s) => ({ ...project(s.place.lat, s.place.lng), label: String(s.order), id: s.place.id })),
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="데모 경로 지도">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e3eaf6" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="#f8fafc" />
      <rect width={W} height={H} fill="url(#grid)" />

      <text x={16} y={26} fontSize="12.5" fill="#94a3b8" fontWeight="600">
        데모 지도 (실제 지도 타일 아님 · 좌표 개념도)
      </text>

      {/* 도로 경로가 있으면 실선으로, 없으면 지점을 잇는 점선으로 */}
      {roadPath && roadPath.length >= 2 ? (
        <polyline
          points={roadPath
            .map((p) => {
              const q = project(p.lat, p.lng);
              return `${q.x},${q.y}`;
            })
            .join(' ')}
          fill="none"
          stroke="#2340e4"
          strokeWidth="3.5"
          strokeOpacity="0.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        points.length >= 2 && (
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#2340e4"
            strokeWidth="3"
            strokeOpacity="0.55"
            strokeDasharray="8 6"
            strokeLinecap="round"
          />
        )
      )}

      {stops.map((s, i) => {
        const from = points[origin ? i : i - 1];
        const to = points[origin ? i + 1 : i];
        if (!from || !to || s.travelFromPrevMinutes <= 0) return null;
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        return (
          <g key={`leg-${s.place.id}`}>
            <rect x={mx - 36} y={my - 11} width={72} height={20} rx={10} fill="#fff" stroke="#dbe6ff" />
            <text x={mx} y={my + 3} fontSize="11" textAnchor="middle" fill="#2340e4" fontWeight="700">
              {s.travelFromPrevMinutes}분 · {s.distanceFromPrevKm.toFixed(1)}km
            </text>
          </g>
        );
      })}

      {origin && (
        <g>
          <circle cx={points[0].x} cy={points[0].y} r={11} fill="#1b2b46" />
          <circle cx={points[0].x} cy={points[0].y} r={4} fill="#7dd3fc" />
          <text
            x={points[0].x}
            y={points[0].y + 28}
            fontSize="11.5"
            textAnchor="middle"
            fill="#334155"
            fontWeight="700"
          >
            출발 · {origin.name}
          </text>
        </g>
      )}

      {stops.map((s) => {
        const p = project(s.place.lat, s.place.lng);
        const selected = selectedId === s.place.id;
        const color = CATEGORY_META[s.place.category].color;
        return (
          <g
            key={s.place.id}
            onClick={() => onSelect(s.place.id)}
            style={{ cursor: 'pointer' }}
            tabIndex={0}
            role="button"
            aria-label={`${s.order}번 ${s.place.name} 상세보기`}
          >
            {selected && <circle cx={p.x} cy={p.y} r={21} fill="#2340e4" fillOpacity={0.14} />}
            <circle
              cx={p.x}
              cy={p.y}
              r={14}
              fill={color}
              stroke={selected ? '#2340e4' : '#fff'}
              strokeWidth={selected ? 3 : 2}
            />
            <text
              x={p.x}
              y={p.y + 4.5}
              fontSize="13"
              textAnchor="middle"
              fill="#fff"
              fontWeight="800"
            >
              {s.order}
            </text>
            <text
              x={p.x}
              y={p.y + 31}
              fontSize="11.5"
              textAnchor="middle"
              fill="#1b2b46"
              fontWeight="700"
            >
              {s.place.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
