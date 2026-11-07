import {
  AlertTriangle,
  Clock,
  Coffee,
  Database,
  Flag,
  MapPin,
  Repeat2,
  Route,
  Target,
  Timer,
  XCircle,
} from 'lucide-react';
import { upsertStore } from '../lib/storeDb';
import type { RouteCandidate, RouteSearchResult } from '../types';
import { CATEGORY_META } from '../data/categories';
import { STATUS_META } from '../lib/storeStatus';
import { breaksSummary, closedDaysSummary, hoursSummary } from '../lib/businessHours';
import { formatClock, formatDuration } from '../lib/time';

interface Props {
  result: RouteSearchResult;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 대체 장소로 교체하고 동선을 다시 계산 */
  onUseAlternative: (altStoreId: string) => void;
}

function distanceText(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function CandidateCard({
  c,
  selected,
  onSelect,
  distanceLabel = '출발지에서',
  onUseAlternative,
}: {
  c: RouteCandidate;
  selected: boolean;
  onSelect: () => void;
  distanceLabel?: string;
  onUseAlternative?: (altStoreId: string) => void;
}) {
  const meta = CATEGORY_META[c.store.category];
  const Icon = meta.icon;
  const status = STATUS_META[c.evaluation.status];

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
          selected
            ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-500/15'
            : 'border-navy-100 bg-white hover:bg-navy-50/60'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md text-[12px] font-bold text-white"
            style={{ background: status.marker }}
          >
            {c.order ?? '·'}
          </span>
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${meta.bg}`}>
            <Icon size={13} />
          </span>
          <span className="text-[14.5px] font-bold text-navy-900">{c.store.name}</span>
          <span className={`chip ${meta.bg}`}>{meta.label}</span>
          <span className={`chip ${status.chip}`}>{status.label}</span>
          {c.store.dataKind === 'demo' && (
            <span className="chip bg-navy-100 text-navy-600">데모 데이터</span>
          )}
          {c.store.dataKind === 'live' && (
            <span className="chip bg-sky-50 text-sky-700">지도 검색 결과</span>
          )}
          {c.store.dataKind === 'real' && (
            <span className="chip bg-emerald-50 text-emerald-700">확인된 정보</span>
          )}
        </div>

        <p className="mt-1.5 flex items-center gap-1 truncate text-[12px] text-navy-400">
          <MapPin size={11} />
          {c.store.address}
        </p>

        <div className="mt-2 grid gap-1 text-[12.5px] text-navy-600 sm:grid-cols-2">
          <span className="flex items-center gap-1">
            <Route size={12} className="text-brand-600" />
            {distanceLabel} <strong className="font-semibold">{distanceText(c.travelKm)}</strong>
            <span className="text-navy-400">({c.realRoad ? '실제 도로' : '직선 추정'})</span>
          </span>
          <span className="flex items-center gap-1">
            <Timer size={12} className="text-brand-600" />
            이동 <strong className="font-semibold">{formatDuration(c.travelMin)}</strong>
            <span className="text-navy-400">({c.realDuration ? '실측' : '추정'})</span>
          </span>
          <span className="tnum flex items-center gap-1">
            <Clock size={12} />
            도착 예정 <strong className="font-semibold">{formatClock(c.arrivalMinutes)}</strong>
          </span>
          <span>
            예상 체류 <strong className="font-semibold">{formatDuration(c.store.stayMinutes)}</strong>
          </span>
          <span>영업시간 {hoursSummary(c.store.business)}</span>
          <span className="flex items-center gap-1">
            <Coffee size={12} />
            브레이크 {c.store.business.breaks.length > 0 ? breaksSummary(c.store.business) : '정보 없음'}
          </span>
          <span>휴무 {closedDaysSummary(c.store.business)}</span>
          <span>경로에서 {distanceText(c.detourKm)} 벗어남</span>
        </div>

        <p
          className={`mt-2 rounded-lg px-2.5 py-2 text-[12px] leading-relaxed ${status.chip}`}
        >
          {c.evaluation.detail}
        </p>

        {/* 방문 불가 → 같은 업종의 대체 장소 제안 */}
        {c.alternative && (
          <div className="mt-2.5 rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-brand-800">
              <Repeat2 size={13} />
              대체 장소 제안
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-navy-700">
              같은 업종의{' '}
              <strong className="font-bold">{c.alternative.candidate.store.name}</strong> 은(는) 여기서{' '}
              {distanceText(c.alternative.distanceKm)} 떨어져 있고,{' '}
              <strong className="font-bold">
                {STATUS_META[c.alternative.candidate.evaluation.status].label}
              </strong>{' '}
              입니다.
            </p>
            <p className="mt-0.5 text-[11.5px] text-navy-500">
              출발지에서 {distanceText(c.alternative.candidate.travelKm)} ·{' '}
              {formatDuration(c.alternative.candidate.travelMin)} · 도착 예정{' '}
              {formatClock(c.alternative.candidate.arrivalMinutes)}
            </p>
            {onUseAlternative && (
              <span
                role="button"
                tabIndex={0}
                className="btn-primary mt-2 px-3 py-1.5 text-[12.5px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onUseAlternative(c.alternative!.candidate.store.id);
                }}
              >
                <Repeat2 size={13} />이 장소로 바꿔 동선 다시 짜기
              </span>
            )}
          </div>
        )}

        {c.store.dataKind === 'live' && (
          <span
            role="button"
            tabIndex={0}
            className="btn-secondary mt-2 px-2.5 py-1.5 text-[12px]"
            onClick={(e) => {
              e.stopPropagation();
              upsertStore({ ...c.store, dataKind: 'real' });
              alert(
                `"${c.store.name}" 을(를) 장소 DB에 등록했습니다.\n장소 정보 관리 메뉴에서 영업시간·휴무·브레이크 타임을 입력하면 다음 검색부터 반영됩니다.`,
              );
            }}
          >
            <Database size={13} />
            이 장소를 DB에 등록
          </span>
        )}

        <p className="mt-1.5 text-[11.5px] text-navy-400">
          {c.store.verifiedAt ? (
            <>
              정보 최종 확인: <strong className="font-semibold text-navy-500">{c.store.verifiedAt}</strong>
              {c.store.sourceUrl && (
                <>
                  {' · 출처 '}
                  <a
                    href={c.store.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-brand-600"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.store.sourceUrl.replace(/^https?:\/\//, '').split('/')[0]}
                  </a>
                </>
              )}
            </>
          ) : (
            '정보 최종 확인일이 등록되어 있지 않습니다.'
          )}
        </p>
      </button>
    </li>
  );
}

export function RouteResultList({ result, selectedId, onSelect, onUseAlternative }: Props) {
  const { baseRoute, visitable, unvisitable, params } = result;

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-bold text-navy-900">
          <Route size={17} className="text-brand-600" />
          {params.origin.name}
          <span className="text-navy-300">→</span>
          {params.destination.name}
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-navy-50 px-3 py-2.5">
            <p className="text-[11.5px] font-semibold text-navy-400">기본 경로 거리</p>
            <p className="tnum text-[17px] font-extrabold text-navy-900">
              {baseRoute.distanceKm.toFixed(1)}km
            </p>
          </div>
          <div className="rounded-xl bg-navy-50 px-3 py-2.5">
            <p className="text-[11.5px] font-semibold text-navy-400">기본 소요시간</p>
            <p className="tnum text-[17px] font-extrabold text-navy-900">
              {formatDuration(baseRoute.durationMin)}
            </p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
            <p className="text-[11.5px] font-semibold text-emerald-700">방문 가능</p>
            <p className="tnum text-[17px] font-extrabold text-emerald-700">{visitable.length}곳</p>
          </div>
          <div className="rounded-xl bg-rose-50 px-3 py-2.5">
            <p className="text-[11.5px] font-semibold text-rose-700">방문 불가</p>
            <p className="tnum text-[17px] font-extrabold text-rose-700">{unvisitable.length}곳</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1">
          {result.notes.map((n) => (
            <li key={n} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-navy-400">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {n}
            </li>
          ))}
          <li className="text-[11.5px] text-navy-400">
            DB에서 {result.scannedCount}곳을 검사해 경로 반경 {params.radiusKm}km 안의 장소를 추렸습니다.
          </li>
        </ul>
      </section>

      <section className="card p-5">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
          <Flag size={17} className="text-emerald-600" />
          방문 가능한 장소 · 출발지에서 가까운 순
        </h3>
        {visitable.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-navy-200 bg-navy-50/60 px-4 py-6 text-center text-[13.5px] text-navy-500">
            이 시각에 방문할 수 있는 장소가 없습니다. 출발 시간이나 검색 범위를 바꿔 보세요.
          </p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {visitable.map((c) => (
              <CandidateCard
                key={c.store.id}
                c={c}
                selected={selectedId === c.store.id}
                onSelect={() => onSelect(c.store.id)}
              />
            ))}
          </ol>
        )}
        <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">
          <Target size={13} />
          도착지: {params.destination.name} · 도착 예정{' '}
          {formatClock(result.destinationArrivalMinutes)}
        </p>
      </section>

      {/* 도착지 주변 */}
      <section className="card p-5">
        <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
          <Target size={17} className="text-rose-600" />
          도착지 주변 장소 · {params.destination.name}에서 가까운 순
        </h3>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-navy-500">
          도착지에 도착하는 {formatClock(result.destinationArrivalMinutes)} 기준으로 영업 여부를
          판정했습니다. 목적지에 도착한 뒤 들를 곳을 고를 때 사용하세요.
        </p>
        {result.nearDestination.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-navy-200 bg-navy-50/60 px-4 py-6 text-center text-[13.5px] text-navy-500">
            도착지 반경 {Math.max(params.radiusKm, 1)}km 안에서 장소를 찾지 못했습니다. 검색 범위를
            넓혀 보세요.
          </p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {result.nearDestination.map((c) => (
              <CandidateCard
                key={`dest-${c.store.id}`}
                c={c}
                selected={selectedId === c.store.id}
                onSelect={() => onSelect(c.store.id)}
                distanceLabel="도착지에서"
                onUseAlternative={onUseAlternative}
              />
            ))}
          </ol>
        )}
      </section>

      {unvisitable.length > 0 && (
        <section className="card border-rose-200 p-5">
          <h3 className="flex items-center gap-2 text-[16px] font-bold text-rose-700">
            <XCircle size={17} />
            지금은 방문할 수 없는 장소 {unvisitable.length}곳
          </h3>
          <p className="mt-1.5 text-[12.5px] text-navy-500">
            경로 주변에 있지만 휴무·브레이크 타임·영업 종료로 방문이 어려운 곳입니다.
          </p>
          <ul className="mt-3 space-y-2.5">
            {unvisitable.map((c) => (
              <CandidateCard
                key={c.store.id}
                c={c}
                selected={selectedId === c.store.id}
                onSelect={() => onSelect(c.store.id)}
                onUseAlternative={onUseAlternative}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
