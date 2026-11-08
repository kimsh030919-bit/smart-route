import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Hourglass,
  MapPin,
  Minus,
  Plus,
  Timer,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type { BusinessInfo, Place, Priority } from '../types';
import { CATEGORY_META } from '../data/categories';
import {
  breaksSummary,
  closedDaysSummary,
  effectiveHours,
  hoursSummary,
  latestArrival,
  tempClosureOn,
  tempClosureSummary,
} from '../lib/businessHours';
import { PRIORITY_LABELS } from '../lib/optimizer';
import { WEEKDAY_LABELS, formatClock, weekdayOf } from '../lib/time';
import { HoursEditor } from './HoursEditor';

interface Props {
  place: Place;
  index: number;
  date: string;
  onUpdate: (patch: Partial<Place>) => void;
  onRemove: () => void;
}

const STAY_PRESETS = [30, 45, 60, 90, 120];

/** 희망 방문 시간 원터치 프리셋 — 직접 타이핑하지 않아도 되도록 */
const PREFERRED_PRESETS = [
  { label: '아침', value: '09:00' },
  { label: '점심', value: '12:00' },
  { label: '오후', value: '15:00' },
  { label: '저녁', value: '18:00' },
  { label: '밤', value: '20:00' },
];

/** "HH:MM" 을 delta 분만큼 옮긴다 (00:00~23:55 범위로 고정) */
function shiftTime(value: string | undefined, delta: number): string | undefined {
  if (!value) return value;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return value;
  const total = Number(m[1]) * 60 + Number(m[2]) + delta;
  const clamped = Math.min(23 * 60 + 55, Math.max(0, total));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

export function PlaceCard({ place, index, date, onUpdate, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const meta = CATEGORY_META[place.category];
  const Icon = meta.icon;
  const weekday = weekdayOf(date);
  // 요일별 설정까지 반영한 "그날" 기준 상태
  const eff = weekday !== null ? effectiveHours(place.business, weekday) : null;
  const closedToday = weekday !== null && place.business.verified && !!eff?.closed;
  const tempToday = tempClosureOn(place.business, date);
  // 이 장소에 늦어도 몇 시까지 도착해야 하는지
  const deadline =
    weekday !== null
      ? latestArrival(place.business, weekday, place.stayMinutes, date)
      : null;

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
            {tempToday && (
              <span className="chip bg-rose-50 text-rose-700">
                <XCircle size={11} />
                {tempToday.date} 임시 휴무
              </span>
            )}
            {eff?.fromWeekly && !eff.closed && (
              <span className="chip bg-brand-50 text-brand-700">
                {WEEKDAY_LABELS[weekday!]}요일 전용 시간
              </span>
            )}
            {place.preferredArrival && (
              <span className="chip bg-brand-600 text-white">
                <Clock size={11} />
                {place.preferredArrival} 이후 방문
              </span>
            )}
          </div>

          <p className="mt-1 flex items-center gap-1 truncate text-[12px] text-navy-400">
            <MapPin size={11} />
            {place.address}
          </p>

          {/* 핵심 정보 한 줄: 영업시간 · 머무는 시간 · 도착 마감 */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
            <span className="flex items-center gap-1.5 font-semibold text-navy-800">
              <Clock size={13} className="text-navy-400" />
              {hoursSummary(place.business, weekday ?? undefined)}
            </span>
            <span className="text-navy-200">|</span>
            <span className="flex items-center gap-1.5 text-navy-600">
              <Timer size={13} className="text-navy-400" />
              {place.stayMinutes}분 머무름
            </span>
            {deadline !== null && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-0.5 font-bold text-brand-700">
                <Hourglass size={12} />
                {formatClock(deadline)}까지 도착
              </span>
            )}
          </div>

          {/* 보조 정보는 한 단계 작게 */}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-navy-400">
            <span>브레이크 {breaksSummary(place.business, weekday ?? undefined)}</span>
            <span>{closedDaysSummary(place.business)}</span>
            {eff?.lastOrder && <span>라스트오더 {eff.lastOrder}</span>}
            {(place.business.tempClosures?.length ?? 0) > 0 && (
              <span>임시 휴무 {tempClosureSummary(place.business)}</span>
            )}
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

      {/* 세부 설정 — 기본은 접어 두어 목록을 짧게 유지한다 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={`btn px-2.5 py-1 text-[12.5px] font-semibold ${
            detailOpen
              ? 'bg-navy-900 text-white'
              : 'border border-navy-200 text-navy-600 hover:bg-navy-50'
          }`}
          onClick={() => setDetailOpen((v) => !v)}
        >
          {detailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          체류시간 · 우선순위 · 희망시간
        </button>
        <button
          type="button"
          className={`btn px-2.5 py-1 text-[12.5px] font-semibold ${
            open ? 'bg-navy-900 text-white' : 'border border-navy-200 text-navy-600 hover:bg-navy-50'
          }`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          영업시간 직접 입력
        </button>
      </div>

      {detailOpen && (
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
        <div className="sm:col-span-2">
          <span className="mb-1.5 flex items-center gap-1 text-[11.5px] font-semibold text-navy-500">
            <Clock size={12} />
            희망 방문 시간
            <span className="font-normal text-navy-400">— 누르면 바로 지정됩니다</span>
          </span>

          {/* 자주 쓰는 시간대 원터치 */}
          <div className="flex flex-wrap gap-1">
            {PREFERRED_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() =>
                  onUpdate({
                    preferredArrival: place.preferredArrival === p.value ? undefined : p.value,
                  })
                }
                className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                  place.preferredArrival === p.value
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-navy-200 text-navy-600 hover:border-brand-300 hover:bg-brand-50'
                }`}
              >
                {p.label}
                <span className="tnum ml-1 font-normal opacity-70">{p.value}</span>
              </button>
            ))}
          </div>

          {/* 세밀한 조정 */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="btn px-2 py-1.5 text-[12.5px] font-bold border border-navy-200 text-navy-600 hover:bg-navy-50 disabled:opacity-40"
              onClick={() => onUpdate({ preferredArrival: shiftTime(place.preferredArrival, -30) })}
              disabled={!place.preferredArrival}
              aria-label="희망 시간 30분 당기기"
            >
              <Minus size={13} />
              30분
            </button>
            <input
              type="time"
              step={300}
              className="input tnum w-[118px] px-2 py-1.5 text-center text-[14px] font-bold"
              value={place.preferredArrival ?? ''}
              onChange={(e) => onUpdate({ preferredArrival: e.target.value || undefined })}
            />
            <button
              type="button"
              className="btn px-2 py-1.5 text-[12.5px] font-bold border border-navy-200 text-navy-600 hover:bg-navy-50 disabled:opacity-40"
              onClick={() => onUpdate({ preferredArrival: shiftTime(place.preferredArrival, 30) })}
              disabled={!place.preferredArrival}
              aria-label="희망 시간 30분 미루기"
            >
              <Plus size={13} />
              30분
            </button>
            {place.preferredArrival ? (
              <button
                type="button"
                className="btn-ghost px-2 py-1.5 text-[12px] text-navy-500"
                onClick={() => onUpdate({ preferredArrival: undefined })}
              >
                <X size={12} />
                해제
              </button>
            ) : (
              <span className="text-[11.5px] text-navy-400">비워 두면 자동 배치</span>
            )}
          </div>

          <p className="mt-1.5 text-[11.5px] leading-relaxed text-navy-400">
            지정하면 그 시각 <strong>이후</strong>에 도착하도록 순서를 맞춥니다.
            {deadline !== null && place.preferredArrival && (
              <>
                {' '}
                이 장소는 <strong className="text-navy-600">{formatClock(deadline)}</strong>까지는
                도착해야 합니다.
              </>
            )}
          </p>
        </div>

      </div>
      )}

      {open && (
        <HoursEditor
          info={place.business}
          onChange={(next: BusinessInfo) => onUpdate({ business: next })}
        />
      )}
    </div>
  );
}
