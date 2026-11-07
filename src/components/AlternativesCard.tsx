import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, MapPin, Repeat2, Search } from 'lucide-react';
import type { ExcludedPlace, Place } from '../types';
import { CATEGORY_META } from '../data/categories';
import { EXCLUSION_LABELS } from '../lib/businessHours';
import { findAlternatives, alternativeToPlace, type Alternative } from '../lib/alternatives';
import { hasVworldKey } from '../lib/vworld';

interface Props {
  excluded: ExcludedPlace[];
  /** 대체 장소로 교체 (기존 장소 삭제 + 새 장소 추가 + 재계산) */
  onReplace: (oldPlaceId: string, next: Place) => void;
}

function distanceText(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/**
 * 방문할 수 없게 된 장소마다 "주변 같은 업종 대체 장소"를 찾아 제안한다.
 * 한 번에 최대 3곳까지 자동으로 찾는다.
 */
export function AlternativesCard({ excluded, onReplace }: Props) {
  const targets = excluded.slice(0, 3);
  const [results, setResults] = useState<Record<string, Alternative[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (targets.length === 0) return;
    let alive = true;
    setLoading(true);
    setError(null);

    Promise.all(
      targets.map((ex) =>
        findAlternatives(ex.place)
          .then((alts) => [ex.place.id, alts] as const)
          .catch(() => [ex.place.id, [] as Alternative[]] as const),
      ),
    )
      .then((pairs) => {
        if (!alive) return;
        setResults(Object.fromEntries(pairs));
      })
      .catch(() => {
        if (!alive) return;
        setError('대체 장소를 찾는 중 오류가 발생했습니다.');
      })
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excluded.map((e) => e.place.id).join(',')]);

  if (targets.length === 0) return null;

  return (
    <section className="card border-brand-200 p-5">
      <h3 className="flex items-center gap-2 text-[16px] font-bold text-brand-700">
        <Repeat2 size={17} />
        문을 닫은 장소 대신 가 볼 만한 곳
      </h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-navy-500">
        방문할 수 없게 된 장소 주변 2km 안에서 <strong>같은 업종</strong>의 장소를 찾았습니다.
        교체하면 동선이 자동으로 다시 계산됩니다.
      </p>

      {loading && (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-navy-500">
          <Loader2 size={14} className="animate-spin" />
          주변 대체 장소를 찾는 중…
        </p>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2.5 text-[12.5px] text-rose-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-3 space-y-4">
        {targets.map((ex) => {
          const alts = results[ex.place.id] ?? [];
          const meta = CATEGORY_META[ex.place.category];
          return (
            <div key={ex.place.id} className="rounded-xl border border-navy-100 p-3.5">
              <p className="text-[13.5px] font-bold text-navy-900">
                {ex.place.name}
                <span className="ml-2 chip bg-rose-50 text-rose-700">
                  {EXCLUSION_LABELS[ex.reason]}
                </span>
                <span className={`ml-1 chip ${meta.bg}`}>{meta.label}</span>
              </p>

              {!loading && alts.length === 0 ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-navy-500">
                  주변 2km 안에서 같은 업종의 대체 장소를 찾지 못했습니다.
                  {!hasVworldKey() && ' (지도 API 키가 없어 데모 장소에서만 찾았습니다)'}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {alts.map((alt) => {
                    const altMeta = CATEGORY_META[alt.result.category];
                    const AltIcon = altMeta.icon;
                    return (
                      <li
                        key={alt.result.id}
                        className="flex items-start gap-3 rounded-lg bg-brand-50/60 px-3 py-2.5"
                      >
                        <span
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${altMeta.bg}`}
                        >
                          <AltIcon size={14} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold text-navy-900">
                            {alt.result.name}
                            <span className="chip bg-white text-navy-600">
                              {distanceText(alt.distanceKm)}
                            </span>
                            {!alt.result.business.verified && (
                              <span className="chip bg-amber-50 text-amber-700">정보 확인 필요</span>
                            )}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-navy-400">
                            <MapPin size={10} />
                            {alt.result.address}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-primary shrink-0 px-3 py-1.5 text-[12.5px]"
                          onClick={() =>
                            onReplace(ex.place.id, alternativeToPlace(alt, ex.place.stayMinutes))
                          }
                        >
                          <Repeat2 size={13} />
                          교체
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-navy-400">
        <Search size={12} className="mt-0.5 shrink-0" />
        대체 장소는 지도 검색 결과입니다. 영업시간·휴무·브레이크 타임은 제공되지 않아 &lsquo;정보 확인
        필요&rsquo;로 들어가며, 장소 카드에서 직접 입력하면 다음 계산에 반영됩니다.
      </p>
    </section>
  );
}
