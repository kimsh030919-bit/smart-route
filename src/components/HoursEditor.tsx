import { CalendarX2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { BusinessInfo, DayHours, TempClosure } from '../types';
import { WEEKDAY_LABELS, todayISO } from '../lib/time';

interface Props {
  info: BusinessInfo;
  onChange: (next: BusinessInfo) => void;
}

/** 장소별 영업정보 직접 입력/수정 (입력하면 verified 처리되어 동선 계산에 반영) */
export function HoursEditor({ info, onChange }: Props) {
  const patch = (p: Partial<BusinessInfo>) => {
    const merged: BusinessInfo = { ...info, ...p };
    // 기본 영업시간이 있거나, 요일별 설정이 하나라도 있으면 "확인된 정보"로 본다
    const hasBase = !!merged.open && !!merged.close;
    const hasWeekly = (merged.weeklyHours ?? []).some((d) => d && (d.closed || (d.open && d.close)));
    const hasHours = hasBase || hasWeekly;
    onChange({ ...merged, verified: hasHours, source: hasHours ? 'user' : 'unknown' });
  };

  const toggleWeekday = (d: number) => {
    const set = new Set(info.closedWeekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    patch({ closedWeekdays: [...set].sort((a, b) => a - b) });
  };

  /* ───────── 요일별 영업시간 ───────── */

  const weekly: (DayHours | null)[] =
    info.weeklyHours ?? Array.from({ length: 7 }, () => null);

  const setDay = (d: number, next: DayHours | null) => {
    const list: (DayHours | null)[] = [...weekly];
    list[d] = next;
    patch({ weeklyHours: list.some(Boolean) ? list : undefined });
  };

  const enableDay = (d: number) => {
    // 기본 영업시간을 복사해서 그 요일만 따로 편집하게 한다
    setDay(d, {
      closed: info.closedWeekdays.includes(d),
      open: info.open,
      close: info.close,
      lastOrder: info.lastOrder,
      breaks: info.breaks.map((b) => ({ ...b })),
    });
  };

  const patchDay = (d: number, p: Partial<DayHours>) => {
    const cur = weekly[d];
    if (!cur) return;
    setDay(d, { ...cur, ...p });
  };

  /* ───────── 임시 휴무 날짜 ───────── */

  const tempClosures = info.tempClosures ?? [];
  const setTempClosures = (list: TempClosure[]) =>
    patch({ tempClosures: list.length > 0 ? list : undefined });

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
              weeklyHours: undefined,
              tempClosures: undefined,
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
        <p className="mt-1 text-[11px] leading-relaxed text-navy-400">
          요일별로 영업시간이 다르면 아래에서 그 요일만 따로 설정하세요.
        </p>
      </div>

      {/* 요일별 영업시간 */}
      <div className="mt-3">
        <span className="mb-1 block text-[11.5px] font-semibold text-navy-500">
          요일별 영업시간 (설정한 요일만 기본값을 덮어씁니다)
        </span>
        <div className="space-y-1.5">
          {WEEKDAY_LABELS.map((label, d) => {
            const day = weekly[d];
            return (
              <div key={label} className="rounded-lg border border-navy-100 bg-white px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center text-[12.5px] font-bold text-navy-700">
                    {label}
                  </span>
                  {!day ? (
                    <>
                      <span className="flex-1 text-[11.5px] text-navy-400">
                        기본 영업시간 사용
                        {info.closedWeekdays.includes(d) && ' · 정기 휴무'}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost px-2 py-0.5 text-[11.5px] text-brand-700 hover:bg-brand-50"
                        onClick={() => enableDay(d)}
                      >
                        따로 설정
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="flex items-center gap-1 text-[11.5px] font-semibold text-navy-600">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
                          checked={day.closed}
                          onChange={(e) => patchDay(d, { closed: e.target.checked })}
                        />
                        휴무
                      </label>
                      {!day.closed && (
                        <>
                          <input
                            type="time"
                            step={300}
                            className="input tnum w-[88px] px-1.5 py-1 text-[12px]"
                            value={day.open ?? ''}
                            onChange={(e) => patchDay(d, { open: e.target.value || undefined })}
                          />
                          <span className="text-navy-300">~</span>
                          <input
                            type="time"
                            step={300}
                            className="input tnum w-[88px] px-1.5 py-1 text-[12px]"
                            value={day.close ?? ''}
                            onChange={(e) => patchDay(d, { close: e.target.value || undefined })}
                          />
                        </>
                      )}
                      <button
                        type="button"
                        className="btn-ghost ml-auto shrink-0 px-1.5 py-1 text-navy-400 hover:bg-navy-50"
                        onClick={() => setDay(d, null)}
                        aria-label={`${label}요일 개별 설정 해제`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>

                {day && !day.closed && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-7">
                    <span className="text-[11px] text-navy-400">라스트오더</span>
                    <input
                      type="time"
                      step={300}
                      className="input tnum w-[88px] px-1.5 py-1 text-[12px]"
                      value={day.lastOrder ?? ''}
                      onChange={(e) => patchDay(d, { lastOrder: e.target.value || undefined })}
                    />
                    <span className="text-[11px] text-navy-400">브레이크</span>
                    {(day.breaks ?? []).map((b, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <input
                          type="time"
                          step={300}
                          className="input tnum w-[88px] px-1.5 py-1 text-[12px]"
                          value={b.start}
                          onChange={(e) => {
                            const next = [...(day.breaks ?? [])];
                            next[i] = { ...next[i], start: e.target.value };
                            patchDay(d, { breaks: next });
                          }}
                        />
                        <span className="text-navy-300">~</span>
                        <input
                          type="time"
                          step={300}
                          className="input tnum w-[88px] px-1.5 py-1 text-[12px]"
                          value={b.end}
                          onChange={(e) => {
                            const next = [...(day.breaks ?? [])];
                            next[i] = { ...next[i], end: e.target.value };
                            patchDay(d, { breaks: next });
                          }}
                        />
                        <button
                          type="button"
                          className="btn-ghost px-1 py-0.5 text-rose-500 hover:bg-rose-50"
                          onClick={() =>
                            patchDay(d, { breaks: (day.breaks ?? []).filter((_, x) => x !== i) })
                          }
                          aria-label="브레이크 타임 삭제"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="btn-ghost px-1.5 py-0.5 text-[11.5px] text-brand-700 hover:bg-brand-50"
                      onClick={() =>
                        patchDay(d, {
                          breaks: [...(day.breaks ?? []), { start: '15:00', end: '17:00' }],
                        })
                      }
                    >
                      <Plus size={12} />
                      추가
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 임시 휴무 날짜 */}
      <div className="mt-3">
        <span className="mb-1 flex items-center gap-1 text-[11.5px] font-semibold text-navy-500">
          <CalendarX2 size={12} />
          임시 휴무일 (날짜 지정)
        </span>
        {tempClosures.length === 0 && (
          <p className="text-[12px] text-navy-400">등록된 임시 휴무일이 없습니다.</p>
        )}
        <div className="space-y-2">
          {tempClosures.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="date"
                className="input tnum px-2 py-1.5 text-[13px]"
                value={t.date}
                onChange={(e) => {
                  const next = [...tempClosures];
                  next[i] = { ...next[i], date: e.target.value };
                  setTempClosures(next);
                }}
              />
              <input
                className="input px-2 py-1.5 text-[13px]"
                placeholder="사유 (선택)"
                value={t.reason ?? ''}
                onChange={(e) => {
                  const next = [...tempClosures];
                  next[i] = { ...next[i], reason: e.target.value };
                  setTempClosures(next);
                }}
              />
              <button
                type="button"
                className="btn-ghost shrink-0 px-2 py-1 text-rose-500 hover:bg-rose-50"
                onClick={() => setTempClosures(tempClosures.filter((_, idx) => idx !== i))}
                aria-label="임시 휴무일 삭제"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-secondary mt-2 px-2.5 py-1.5 text-[12.5px]"
          onClick={() => setTempClosures([...tempClosures, { date: todayISO() }])}
        >
          <Plus size={13} />
          임시 휴무일 추가
        </button>
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
