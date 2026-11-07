import {
  Clock,
  Coffee,
  Map as MapIcon,
  RefreshCw,
  Search,
  Timer,
  type LucideIcon,
} from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  {
    icon: Search,
    title: '장소 검색 & 담기',
    desc: '카페·음식점·관광지·쇼핑몰·영화관·공원을 검색해 최소 2곳부터 최대 10곳까지 담을 수 있어요.',
  },
  {
    icon: Clock,
    title: '영업정보 확인',
    desc: '영업 시작/종료, 정기 휴무, 임시 휴무, 브레이크 타임, 라스트 오더를 한 화면에서 확인·수정합니다.',
  },
  {
    icon: Coffee,
    title: '브레이크 타임 회피',
    desc: '15:30 도착 예정이고 브레이크가 15:00~17:00이라면 순서를 바꾸거나 대체 시간을 제안합니다.',
  },
  {
    icon: Timer,
    title: '시간 제약 기반 최적화',
    desc: '거리만 보지 않습니다. 도착 가능 시간·체류시간·이동시간을 동시에 만족하는 순서를 계산합니다.',
  },
  {
    icon: MapIcon,
    title: '지도 + 타임라인',
    desc: '방문 순서가 번호로 찍힌 지도와 시간대별 일정표, 총 이동거리·이동시간을 함께 보여 줍니다.',
  },
  {
    icon: RefreshCw,
    title: '조건 변경 후 재계산',
    desc: '장소 추가/삭제, 출발 시간·이동수단 변경, 휴무 발생 시 버튼 한 번으로 다시 계산합니다.',
  },
];

export function Features() {
  return (
    <section className="border-b border-navy-100 bg-navy-50/50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-[26px] font-extrabold tracking-tight text-navy-900 sm:text-[30px]">
          핵심 기능
        </h2>
        <p className="mt-2.5 text-[15px] text-navy-500">
          일정이 꼬이는 이유는 거리가 아니라 &lsquo;시간&rsquo;입니다. SMART ROUTE는 시간 제약을 먼저
          봅니다.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <article key={title} className="card p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-white">
                  <Icon size={17} />
                </span>
                <h3 className="text-[15px] font-bold text-navy-900">{title}</h3>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-navy-500">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
