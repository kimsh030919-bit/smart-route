import { AlertTriangle, ArrowRight, Sparkles, TrendingDown } from 'lucide-react';
import type { ScheduleResult } from '../types';
import { formatDuration } from '../lib/time';

interface Props {
  result: ScheduleResult;
}

/** "거리순으로만 갔을 때" 대비 효과를 보여 주는 카드 (서비스 핵심 가치 증명) */
export function ComparisonCard({ result }: Props) {
  const c = result.comparison;
  if (!c || result.stops.length < 2) return null;

  const savedTravel = c.travelMinutes - result.totalTravelMinutes;
  const savedWait = c.waitMinutes - result.totalWaitMinutes;
  const savedTotal = savedTravel + savedWait;

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-navy-100 px-5 py-4">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
          <TrendingDown size={17} className="text-brand-600" />
          단순 최단거리 순서와 비교
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-navy-500">
          같은 장소 구성을 &lsquo;가까운 곳부터&rsquo; 방문했을 때와, SMART ROUTE의 시간 제약 기반 순서를
          비교한 결과입니다.
        </p>
      </div>

      <div className="grid gap-0 sm:grid-cols-2">
        <div className="border-b border-navy-100 p-5 sm:border-b-0 sm:border-r">
          <span className="chip bg-navy-100 text-navy-600">거리순 (단순 최근접)</span>
          <p className="mt-3 flex flex-wrap items-center gap-1 text-[13px] font-semibold text-navy-700">
            {c.orderNames.map((n, i) => (
              <span key={`${n}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ArrowRight size={12} className="text-navy-300" />}
                {n}
              </span>
            ))}
          </p>
          <ul className="mt-3 space-y-1 text-[12.5px] text-navy-600">
            <li>
              이동 <strong>{formatDuration(c.travelMinutes)}</strong> · {c.distanceKm.toFixed(1)}km
            </li>
            <li>
              대기/허비 <strong>{formatDuration(c.waitMinutes)}</strong>
            </li>
            <li className={c.conflictCount > 0 ? 'text-rose-600' : 'text-emerald-600'}>
              헛걸음 위험 <strong>{c.conflictCount}건</strong>
            </li>
          </ul>
          {c.conflicts.length > 0 && (
            <ul className="mt-2 space-y-1">
              {c.conflicts.map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-rose-700"
                >
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-brand-50/50 p-5">
          <span className="chip bg-brand-600 text-white">
            <Sparkles size={12} />
            SMART ROUTE
          </span>
          <p className="mt-3 flex flex-wrap items-center gap-1 text-[13px] font-semibold text-navy-800">
            {result.stops.map((s, i) => (
              <span key={s.place.id} className="flex items-center gap-1">
                {i > 0 && <ArrowRight size={12} className="text-brand-300" />}
                {s.place.name}
              </span>
            ))}
          </p>
          <ul className="mt-3 space-y-1 text-[12.5px] text-navy-700">
            <li>
              이동 <strong>{formatDuration(result.totalTravelMinutes)}</strong> ·{' '}
              {result.totalDistanceKm.toFixed(1)}km
            </li>
            <li>
              대기 <strong>{formatDuration(result.totalWaitMinutes)}</strong>
            </li>
            <li className="text-emerald-700">
              브레이크/휴무 충돌 <strong>0건</strong> (일정에 포함된 장소 기준)
            </li>
          </ul>

          {savedTotal > 0 && (
            <p className="mt-3 rounded-xl bg-brand-600 px-3 py-2.5 text-[13px] font-bold text-white">
              허비되는 시간 {formatDuration(savedTotal)} 절약
              {c.conflictCount > 0 && ` · 헛걸음 ${c.conflictCount}건 방지`}
            </p>
          )}
          {savedTotal <= 0 && c.conflictCount > 0 && (
            <p className="mt-3 rounded-xl bg-brand-600 px-3 py-2.5 text-[13px] font-bold text-white">
              헛걸음 {c.conflictCount}건 방지
            </p>
          )}
          {savedTotal <= 0 && c.conflictCount === 0 && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-navy-600">
              이번 구성은 거리순 방문으로도 시간 충돌이 없었습니다. 장소를 더 추가하거나 출발 시간을
              바꾸면 차이가 커집니다.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
