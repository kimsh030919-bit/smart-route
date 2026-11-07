import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Coffee,
  MapPin,
  Timer,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { BusinessInfo, Place, Priority } from '../types';
import { CATEGORY_META } from '../data/categories';
import { breaksSummary, closedDaysSummary, hoursSummary } from '../lib/businessHours';
import { PRIORITY_LABELS } from '../lib/optimizer';
import { WEEKDAY_LABELS, weekdayOf } from '../lib/time';
import { HoursEditor } from './HoursEditor';

interface Props {
  place: Place;
  index: number;
  date: string;
  onUpdate: (patch: Partial<Place>) => void;
  onRemove: () => void;
}

const STAY_PRESETS = [30, 45, 60, 90, 120];

export function PlaceCard({ place, index, date, onUpdate, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const meta = CATEGORY_META[place.category];
  const Icon = meta.icon;
  const weekday = weekdayOf(date);
  const closedToday =
    weekday !== null && place.business.verified && place.business.closedWeekdays.includes(weekday);

  return (
    <div className="rounded-xl border border-navy-100 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-[12.5px] font-bold text-white">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.bg}`}>
              <Icon size={13} />
            </span>
            <span className="text-[14.5px] font-bold text-navy-900">{place.name}</span>
            <span className={`chip ${meta.bg}`}>{meta.label}</span>
            {place.isDemo && <span className="chip bg-navy-100 text-navy-600">데모</span>}
            {!place.business.verified && (
              <span className="chip bg-amber-50 text-amber-700">
                <AlertTriangle size={11} />
                정보 확인 필요
              </span>
            )}
            {place.business.temporarilyClosed && (
              <span className="chip bg-rose-50 text-rose-700">
                <XCircle size={11} />
                임시 휴무
              </span>
            )}
            {closedToday && (
              <span className="chip bg-rose-50 text-rose-700">
                {WEEKDAY_LABELS[weekday!]}요일 휴무
              </span>
            )}
          </div>

          <p className="mt-1 flex items-center gap-1 truncate text-[12px] text-navy-400">
            <MapPin size={11} />
            {place.address}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-navy-500">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              영업 {hoursSummary(place.business)}
            </span>
            <span className="flex items-center gap-1">
              <Coffee size={12} />
              브레이크 {breaksSummary(place.business)}
            </span>
            <span>{closedDaysSummary(place.business)}</span>
            {place.business.lastOrder && <span>라스트오더 {place.business.lastOrder}</span>}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="btn-ghost shrink-0 px-2 py-1.5 text-navy-400 hover:bg-rose-50 hover:text-rose-600"
          aria-label={`${place.name} 삭제`}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* 체류시간 / 우선순위 */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold text-navy-500">
            <Timer size={12} />
            예상 체류시간
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              className="input tnum w-20 px-2 py-1.5 text-[13px]"
              value={place.stayMinutes}
              onChange={(e) => {
                const v = Number(e.target.value);
                onUpdate({ stayMinutes: Number.isFinite(v) ? Math.min(480, Math.max(5, v)) : 30 });
              }}
            />
            <span className="text-[12px] text-navy-400">분</span>
            <div className="flex flex-wrap gap-1">
              {STAY_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onUpdate({ stayMinutes: v })}
                  className={`chip border ${
                    place.stayMinutes === v
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-navy-200 text-navy-500 hover:bg-navy-50'
                  }`}
                >
                  {v}분
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <span className="mb-1 block text-[11.5px] font-semibold text-navy-500">방문 우선순위</span>
          <div className="flex gap-1.5">
            {(['high', 'normal', 'low'] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onUpdate({ priority: p })}
                className={`chip border ${
                  place.priority === p
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-navy-200 text-navy-500 hover:bg-navy-50'
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        className="btn-ghost mt-2 px-1 text-[12.5px] font-semibold text-brand-700 hover:bg-brand-50"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        영업시간 · 휴무 · 브레이크 타임 {open ? '닫기' : '직접 입력'}
      </button>

      {open && (
        <HoursEditor
          info={place.business}
          onChange={(next: BusinessInfo) => onUpdate({ business: next })}
        />
      )}
    </div>
  );
}
