import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { BusinessInfo } from '../types';
import { WEEKDAY_LABELS } from '../lib/time';

interface Props {
  info: BusinessInfo;
  onChange: (next: BusinessInfo) => void;
}

/** 장소별 영업정보 직접 입력/수정 (입력하면 verified 처리되어 동선 계산에 반영) */
export function HoursEditor({ info, onChange }: Props) {
  const patch = (p: Partial<BusinessInfo>) => {
    const merged: BusinessInfo = { ...info, ...p };
    const hasHours = !!merged.open && !!merged.close;
    onChange({ ...merged, verified: hasHours, source: hasHours ? 'user' : 'unknown' });
  };

  const toggleWeekday = (d: number) => {
    const set = new Set(info.closedWeekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    patch({ closedWeekdays: [...set].sort((a, b) => a - b) });
  };

  return (
    <div className="mt-3 rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-navy-800">영업정보 입력</p>
        <button
          type="button"
          className="btn-ghost text-[12px]"
          onClick={() =>
            onChange({
              verified: false,
              open: undefined,
              close: undefined,
              lastOrder: undefined,
              breaks: [],
              closedWeekdays: [],
              temporarilyClosed: false,
              note: '사용자가 미확인으로 표시',
              source: 'unknown',
            })
          }
        >
          <RotateCcw size={12} />
          정보 확인 필요로 초기화
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-navy-500">영업 시작</span>
          <input
            type="time"
            step={300}
            className="input tnum px-2 py-1.5 text-[13px]"
            value={info.open ?? ''}
            onChange={(e) => patch({ open: e.target.value || undefined })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-navy-500">영업 종료</span>
          <input
            type="time"
            step={300}
            className="input tnum px-2 py-1.5 text-[13px]"
            value={info.close ?? ''}
            onChange={(e) => patch({ close: e.target.value || undefined })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11.5px] font-semibold text-navy-500">라스트 오더</span>
          <input
            type="time"
            step={300}
            className="input tnum px-2 py-1.5 text-[13px]"
            value={info.lastOrder ?? ''}
            onChange={(e) => patch({ lastOrder: e.target.value || undefined })}
          />
        </label>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-[11.5px] font-semibold text-navy-500">브레이크 타임</span>
        {info.breaks.length === 0 && (
          <p className="text-[12px] text-navy-400">등록된 브레이크 타임이 없습니다.</p>
        )}
        <div className="space-y-2">
          {info.breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="time"
                step={300}
                className="input tnum px-2 py-1.5 text-[13px]"
                value={b.start}
                onChange={(e) => {
                  const next = [...info.breaks];
                  next[i] = { ...next[i], start: e.target.value };
                  patch({ breaks: next });
                }}
              />
              <span className="text-navy-400">~</span>
              <input
                type="time"
                step={300}
                className="input tnum px-2 py-1.5 text-[13px]"
                value={b.end}
                onChange={(e) => {
                  const next = [...info.breaks];
                  next[i] = { ...next[i], end: e.target.value };
                  patch({ breaks: next });
                }}
              />
              <button
                type="button"
                className="btn-ghost shrink-0 px-2 py-1 text-rose-500 hover:bg-rose-50"
                onClick={() => patch({ breaks: info.breaks.filter((_, idx) => idx !== i) })}
                aria-label="브레이크 타임 삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-2 px-2.5 py-1.5 text-[12.5px]"
          onClick={() => patch({ breaks: [...info.breaks, { start: '15:00', end: '17:00' }] })}
        >
          <Plus size={13} />
          브레이크 타임 추가
        </button>
      </div>

      <div className="mt-3">
        <span className="mb-1 block text-[11.5px] font-semibold text-navy-500">정기 휴무일</span>
        <div className="flex gap-1.5">
          {WEEKDAY_LABELS.map((label, d) => {
            const on = info.closedWeekdays.includes(d);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleWeekday(d)}
                className={`h-8 w-8 rounded-lg border text-[12.5px] font-bold transition-colors ${
                  on
                    ? 'border-rose-500 bg-rose-50 text-rose-600'
                    : 'border-navy-200 bg-white text-navy-500 hover:bg-navy-50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-[13px] font-medium text-navy-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
          checked={info.temporarilyClosed}
          onChange={(e) => patch({ temporarilyClosed: e.target.checked })}
        />
        임시 휴무
      </label>

      <p className="mt-3 text-[11.5px] leading-relaxed text-navy-400">
        영업 시작·종료를 입력하면 <strong>시간 제약</strong>으로 계산에 반영됩니다. 비워 두면
        &lsquo;정보 확인 필요&rsquo;로 표시되고, 임의의 영업시간을 추측해 적용하지 않습니다.
      </p>
    </div>
  );
}
