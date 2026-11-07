import { PlayCircle, Presentation } from 'lucide-react';
import { DEMO_SCENARIOS, type DemoScenario } from '../data/demoPlaces';

interface Props {
  onApply: (scenario: DemoScenario) => void;
  activeId: string | null;
}

export function DemoScenarioBar({ onApply, activeId }: Props) {
  return (
    <section className="card border-navy-900/10 bg-navy-900 p-5 text-white sm:p-6">
      <h3 className="flex items-center gap-2 text-[16px] font-bold">
        <Presentation size={17} className="text-sky-300" />
        발표용 데모 시나리오
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-navy-200">
        API 키 없이도 핵심 기능을 그대로 시연할 수 있는 샘플 구성입니다. 클릭하면 장소·출발시간·이동수단이
        한 번에 설정됩니다.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {DEMO_SCENARIOS.map((s) => {
          const active = activeId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onApply(s)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active
                  ? 'border-sky-300 bg-white/15'
                  : 'border-white/15 bg-white/5 hover:bg-white/10'
              }`}
            >
              <p className="flex items-start gap-1.5 text-[13.5px] font-bold">
                <PlayCircle size={15} className="mt-0.5 shrink-0 text-sky-300" />
                {s.title}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-navy-200">{s.description}</p>
              <p className="mt-2 text-[11.5px] font-semibold text-sky-200">
                {s.startTime} 출발 · 장소 {s.placeIds.length}곳
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
