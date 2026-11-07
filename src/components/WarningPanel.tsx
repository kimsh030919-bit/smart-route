import { AlertTriangle, Info, Lightbulb, XCircle } from 'lucide-react';
import type { ScheduleResult, WarningLevel } from '../types';
import { EXCLUSION_LABELS } from '../lib/businessHours';

interface Props {
  result: ScheduleResult;
}

const LEVEL_STYLE: Record<WarningLevel, { cls: string; icon: typeof Info }> = {
  error: { cls: 'border-rose-200 bg-rose-50 text-rose-800', icon: XCircle },
  warn: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  info: { cls: 'border-navy-200 bg-navy-50 text-navy-700', icon: Info },
};

export function WarningPanel({ result }: Props) {
  const ordered = [...result.warnings].sort((a, b) => {
    const rank: Record<WarningLevel, number> = { error: 0, warn: 1, info: 2 };
    return rank[a.level] - rank[b.level];
  });

  return (
    <div className="space-y-4">
      {result.excluded.length > 0 && (
        <section className="card border-rose-200 p-5">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-rose-700">
            <XCircle size={17} />
            일정에 넣지 못한 장소 {result.excluded.length}곳
          </h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-navy-500">
            조건을 만족할 수 없어 무리하게 넣지 않았습니다. 아래 이유와 대안을 확인해 주세요.
          </p>
          <ul className="mt-3 space-y-2">
            {result.excluded.map((ex) => (
              <li
                key={ex.place.id}
                className="rounded-xl border border-rose-100 bg-rose-50/60 px-3.5 py-3"
              >
                <p className="text-[13.5px] font-bold text-navy-900">
                  {ex.place.name}
                  <span className="ml-2 chip bg-rose-100 text-rose-700">
                    {EXCLUSION_LABELS[ex.reason]}
                  </span>
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-navy-600">{ex.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.suggestions.length > 0 && (
        <section className="card border-brand-200 p-5">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-brand-700">
            <Lightbulb size={17} />
            이렇게 바꾸면 가능해요
          </h3>
          <ul className="mt-3 space-y-2">
            {result.suggestions.map((s) => (
              <li key={s.title} className="rounded-xl bg-brand-50/70 px-3.5 py-3">
                <p className="text-[13.5px] font-bold text-brand-800">{s.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-navy-600">{s.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ordered.length > 0 && (
        <section className="card p-5">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
            <AlertTriangle size={17} className="text-amber-500" />
            휴무 · 브레이크 타임 · 영업정보 알림
          </h3>
          <ul className="mt-3 space-y-2">
            {ordered.map((w, i) => {
              const style = LEVEL_STYLE[w.level];
              const Icon = style.icon;
              return (
                <li
                  key={`${w.title}-${i}`}
                  className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 ${style.cls}`}
                >
                  <Icon size={14} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[13px] font-bold">{w.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed opacity-90">{w.message}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-navy-400">{result.estimateNote}</p>
        </section>
      )}
    </div>
  );
}
