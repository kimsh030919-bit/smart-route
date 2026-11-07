import { ArrowRight, CalendarClock, CircleSlash2, Footprints } from 'lucide-react';

interface Props {
  onStart: () => void;
  onDemo: () => void;
}

const VALUES = [
  {
    icon: Footprints,
    title: '이동시간 낭비 방지',
    desc: '장소 사이 이동시간과 거리를 함께 계산해 되돌아가는 동선을 줄입니다.',
  },
  {
    icon: CircleSlash2,
    title: '헛걸음 방지',
    desc: '정기 휴무·임시 휴무·브레이크 타임·라스트 오더를 미리 걸러냅니다.',
  },
  {
    icon: CalendarClock,
    title: '하루 일정 자동 생성',
    desc: '도착 시간, 체류시간, 이동시간이 들어간 타임라인을 바로 만들어 줍니다.',
  },
];

export function Hero({ onStart, onDemo }: Props) {
  return (
    <section id="top" className="relative overflow-hidden border-b border-navy-100 bg-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-50 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <span className="chip bg-brand-50 text-brand-700">
          영업시간 · 휴무 · 브레이크타임까지 계산하는 동선 설계
        </span>
        <h1 className="mt-5 max-w-3xl text-[32px] font-extrabold leading-[1.25] tracking-tight text-navy-900 sm:text-[46px]">
          가고 싶은 곳만 넣으면,
          <br />
          <span className="text-brand-600">헛걸음 없는 하루 동선</span>이 완성됩니다.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-navy-500 sm:text-[17px]">
          핫플과 맛집을 돌아다니는 2030 여행자를 위한 AI 동선 플래너. 장소별 영업시간, 정기 휴무,
          브레이크 타임, 라스트 오더, 이동시간, 체류시간을 함께 계산해 방문 순서와 타임라인을 자동으로
          만들어 줍니다.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onStart} className="btn-primary">
            나만의 일정 만들기
            <ArrowRight size={18} />
          </button>
          <button type="button" onClick={onDemo} className="btn-secondary py-3">
            데모 시나리오로 1초 체험
          </button>
        </div>

        <dl className="mt-14 grid gap-4 sm:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={20} />
              </span>
              <dt className="mt-4 text-[15px] font-bold text-navy-900">{title}</dt>
              <dd className="mt-1.5 text-[13.5px] leading-relaxed text-navy-500">{desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
