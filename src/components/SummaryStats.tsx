import { Clock, Footprints, Hourglass, MapPin, Timer } from 'lucide-react';
import type { ScheduleResult } from '../types';
import { formatClock, formatDuration } from '../lib/time';

interface Props {
  result: ScheduleResult;
}

export function SummaryStats({ result }: Props) {
  const items = [
    {
      icon: MapPin,
      label: '방문 장소',
      value: `${result.stops.length}곳`,
      sub: result.excluded.length > 0 ? `제외 ${result.excluded.length}곳` : '전체 포함',
    },
    {
      icon: Clock,
      label: '일정 시간',
      value: `${formatClock(result.startMinutes)}~${formatClock(result.endMinutes)}`,
      sub: formatDuration(result.endMinutes - result.startMinutes),
    },
    {
      icon: Footprints,
      label: '총 이동',
      value: formatDuration(result.totalTravelMinutes),
      sub: `${result.totalDistanceKm.toFixed(1)}km`,
    },
    {
      icon: Timer,
      label: '총 체류',
      value: formatDuration(result.totalStayMinutes),
      sub: '장소 이용 시간 합계',
    },
    {
      icon: Hourglass,
      label: '대기시간',
      value: formatDuration(result.totalWaitMinutes),
      sub: result.totalWaitMinutes === 0 ? '대기 없음' : '오픈/브레이크 대기',
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(({ icon: Icon, label, value, sub }) => (
        <div key={label} className="card px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-navy-400">
            <Icon size={13} />
            {label}
          </p>
          <p className="tnum mt-1.5 text-[18px] font-extrabold leading-tight text-navy-900">
            {value}
          </p>
          <p className="mt-0.5 text-[11.5px] text-navy-400">{sub}</p>
        </div>
      ))}
    </section>
  );
}
