import { ArrowDown, CalendarClock, CheckCircle2, Coffee, Flag, Hourglass, Navigation } from 'lucide-react';
import type { Origin, ScheduleResult } from '../types';
import { CATEGORY_META } from '../data/categories';
import { formatClock, formatDateKo, formatDuration, weekdayOf } from '../lib/time';
import { MODE_SPECS } from '../lib/travel';
import { breaksSummary, hoursSummary, latestArrival } from '../lib/businessHours';

interface Props {
  result: ScheduleResult;
  origin: Origin | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function Timeline({ result, origin, selectedId, onSelect }: Props) {
  const { stops, mode } = result;

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
          <CalendarClock size={17} className="text-brand-600" />
          시간대별 일정표
        </h3>
        <span className="text-[12.5px] font-semibold text-navy-500">
          {formatDateKo(result.date)} · {formatClock(result.startMinutes)} 출발 ·{' '}
          {formatClock(result.endMinutes)} 종료
        </span>
      </div>

      {/* 출발 */}
      <div className="mt-5 flex items-start gap-3">
        <div className="flex w-[66px] shrink-0 flex-col items-end pt-0.5">
          <span className="tnum text-[16px] font-extrabold leading-tight text-navy-900">
            {formatClock(result.startMinutes)}
          </span>
          <span className="text-[11.5px] text-navy-400">출발</span>
        </div>
        <div className="flex-1 rounded-xl border border-dashed border-navy-200 bg-navy-50/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-navy-800">
            <Navigation size={13} className="text-brand-600" />
            {origin?.name ?? '출발지 미설정'}
          </p>
          <p className="mt-0.5 text-[12px] text-navy-400">
            {origin?.address ?? '장소들의 중심을 기준으로 계산했습니다.'} · {MODE_SPECS[mode].label} 이동
          </p>
        </div>
      </div>

      <ol className="mt-1">
        {stops.map((s, i) => {
          const meta = CATEGORY_META[s.place.category];
          const Icon = meta.icon;
          const next = stops[i + 1];
          const selected = selectedId === s.place.id;
          return (
            <li key={s.place.id}>
              {/* 이동 구간 */}
              <div className="flex items-stretch gap-3">
                <div className="flex w-[66px] shrink-0 justify-end pr-1">
                  <span className="my-1 w-px bg-navy-200" />
                </div>
                <div className="flex items-center gap-1.5 py-2 text-[12px] font-semibold text-navy-500">
                  <ArrowDown size={13} className="text-navy-300" />
                  {MODE_SPECS[mode].label} {formatDuration(s.travelFromPrevMinutes)} 이동 ·{' '}
                  {s.distanceFromPrevKm.toFixed(1)}km
                  {s.waitMinutes > 0 && (
                    <span className="chip bg-amber-50 text-amber-700">
                      <Hourglass size={11} />
                      대기 {formatDuration(s.waitMinutes)}
                    </span>
                  )}
                </div>
              </div>

              {/* 장소 */}
              <button
                type="button"
                onClick={() => onSelect(s.place.id)}
                className="flex w-full items-start gap-3 text-left"
              >
                <div className="flex w-[66px] shrink-0 flex-col items-end pt-1">
                  <span className="tnum text-[17px] font-extrabold leading-tight text-navy-900">
                    {formatClock(s.start)}
                  </span>
                  <span className="tnum text-[12px] text-navy-400">~{formatClock(s.end)}</span>
                </div>

                <div
                  className={`flex-1 rounded-xl border px-4 py-3 transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/15'
                      : 'border-navy-100 bg-white hover:bg-navy-50/60'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-600 text-[12px] font-bold text-white">
                      {s.order}
                    </span>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.bg}`}>
                      <Icon size={13} />
                    </span>
                    <span className="text-[14.5px] font-bold text-navy-900">{s.place.name}</span>
                    <span className={`chip ${meta.bg}`}>{meta.label}</span>
                  </div>

                  <div className="mt-2 grid gap-x-4 gap-y-1.5 text-[13px] leading-relaxed text-navy-600 sm:grid-cols-2">
                    <span className="tnum">
                      도착 예정 <strong className="font-semibold">{formatClock(s.arrival)}</strong>
                    </span>
                    <span>
                      예상 체류{' '}
                      <strong className="font-semibold">{formatDuration(s.end - s.start)}</strong>
                    </span>
                    <span>
                      영업시간 {hoursSummary(s.place.business)}
                      {s.place.business.lastOrder ? ` · L.O ${s.place.business.lastOrder}` : ''}
                    </span>
                    <span>브레이크 {breaksSummary(s.place.business)}</span>
                    <span>
                      다음 장소까지{' '}
                      <strong className="font-semibold">
                        {next ? formatDuration(next.travelFromPrevMinutes) : '일정 종료'}
                      </strong>
                    </span>
                    {(() => {
                      const wd = weekdayOf(result.date);
                      if (wd === null) return null;
                      const deadline = latestArrival(
                        s.place.business,
                        wd,
                        s.place.stayMinutes,
                        result.date,
                      );
                      if (deadline === null) return null;
                      const tight = deadline - s.arrival <= 30;
                      return (
                        <span className={tight ? 'font-semibold text-rose-600' : ''}>
                          도착 마감{' '}
                          <strong className="font-semibold">{formatClock(deadline)}</strong>
                          {tight && ' (여유 30분 이내)'}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.flags.unverified ? (
                      <span className="chip bg-amber-50 text-amber-700">영업정보 확인 필요</span>
                    ) : (
                      <span className="chip bg-emerald-50 text-emerald-700">
                        <CheckCircle2 size={11} />
                        영업 시간 내 방문
                      </span>
                    )}
                    {s.place.business.breaks.length > 0 &&
                      (s.flags.breakAvoided ? (
                        <span className="chip bg-brand-50 text-brand-700">
                          <Coffee size={11} />
                          브레이크 타임 회피 적용
                        </span>
                      ) : (
                        <span className="chip bg-emerald-50 text-emerald-700">
                          <Coffee size={11} />
                          브레이크 타임 충돌 없음
                        </span>
                      ))}
                    {s.place.preferredArrival && (
                      <span className="chip bg-brand-600 text-white">
                        희망 {s.place.preferredArrival} 이후 방문 반영
                      </span>
                    )}
                    {s.flags.waitedForOpen && s.waitMinutes > 0 && (
                      <span className="chip bg-amber-50 text-amber-700">
                        오픈 대기 {formatDuration(s.waitMinutes)}
                      </span>
                    )}
                    {s.flags.nearLastOrder && (
                      <span className="chip bg-rose-50 text-rose-700">라스트 오더 임박</span>
                    )}
                    {s.flags.nearClose && !s.flags.nearLastOrder && (
                      <span className="chip bg-rose-50 text-rose-700">영업 종료 임박</span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* 종료 */}
      <div className="mt-3 flex items-start gap-3">
        <div className="flex w-[66px] shrink-0 flex-col items-end pt-0.5">
          <span className="tnum text-[16px] font-extrabold leading-tight text-navy-900">
            {formatClock(result.endMinutes)}
          </span>
          <span className="text-[11.5px] text-navy-400">종료</span>
        </div>
        <div className="flex-1 rounded-xl bg-navy-900 px-4 py-3 text-white">
          <p className="flex items-center gap-1.5 text-[13.5px] font-bold">
            <Flag size={13} />
            일정 종료 · 총 {stops.length}곳 방문
          </p>
          <p className="mt-0.5 text-[12px] text-navy-200">
            이동 {formatDuration(result.totalTravelMinutes)} · 체류{' '}
            {formatDuration(result.totalStayMinutes)} · 대기{' '}
            {formatDuration(result.totalWaitMinutes)}
          </p>
        </div>
      </div>
    </section>
  );
}
