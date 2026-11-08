import { useEffect, useState } from 'react';
import { Calendar, Check, Clock, Flag, Navigation, Search, X } from 'lucide-react';
import type { Origin, TransportMode, TripSettings } from '../types';
import { MODE_LIST } from '../lib/travel';
import { canSearchOrigin, searchOrigin } from '../lib/placeSearch';
import { formatDateKo } from '../lib/time';

interface Props {
  settings: TripSettings;
  onChange: (next: TripSettings) => void;
  kakaoReady: boolean;
}

export function TripSettingsCard({ settings, onChange, kakaoReady }: Props) {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Origin[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<TripSettings>) => onChange({ ...settings, ...p });
  const searchable = canSearchOrigin(kakaoReady);
  // 입력칸에 현재 출발지가 그대로 보이는지 (= 적용된 상태인지)
  const isOriginSet = !!settings.origin && query.trim() === settings.origin.name;

  // 저장된 출발지 복원 등으로 출발지가 바뀌면 입력칸도 따라 바뀐다
  useEffect(() => {
    const name = settings.origin?.name ?? '';
    setQuery((q) => (q === name ? q : name));
  }, [settings.origin]);

  async function handleOriginSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (!searchable) {
      setError(
        '지도 API 키(카카오맵 또는 브이월드)가 없어 주소 검색을 사용할 수 없습니다. .env 에 VITE_VWORLD_API_KEY 또는 VITE_KAKAO_MAP_KEY 를 넣어 주세요.',
      );
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const found = await searchOrigin(query.trim());
      setCandidates(found);
      if (found.length === 0) setError('검색 결과가 없습니다. 다른 키워드로 시도해 보세요.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '출발지 검색 중 오류가 발생했습니다.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <section className="card p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
        <Navigation size={17} className="text-brand-600" />
        출발 조건
      </h3>

      {/* 출발지 */}
      <div className="mt-5">
        <label className="label" htmlFor="origin-query">
          출발 지역
        </label>
        <form onSubmit={handleOriginSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Flag
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600"
            />
            <input
              id="origin-query"
              className={`input pl-9 pr-9 font-semibold ${
                isOriginSet
                  ? 'border-emerald-300 bg-emerald-50/40 focus:border-emerald-500 focus:ring-emerald-500/10'
                  : ''
              }`}
              placeholder={searchable ? '예) 성수역, 홍대입구역, 강남역' : '지도 API 키가 필요합니다'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-navy-300 hover:bg-navy-100 hover:text-navy-600"
                aria-label="출발지 입력 지우기"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="btn-secondary shrink-0 px-3"
            disabled={searching || !searchable}
            aria-label="출발지 검색"
          >
            <Search size={16} />
          </button>
        </form>

        {settings.origin &&
          (isOriginSet ? (
            <p className="mt-1.5 flex items-start gap-1 text-[12px] leading-relaxed text-navy-500">
              <Check size={13} className="mt-0.5 shrink-0 text-emerald-600" />
              <span>
                <strong className="font-semibold text-navy-700">출발지 설정됨</strong>
                <span className="text-navy-400"> · {settings.origin.address}</span>
              </span>
            </p>
          ) : (
            <p className="mt-1.5 text-[12px] leading-relaxed text-amber-700">
              아직 적용되지 않았습니다. 검색 후 목록에서 선택하세요. (현재 출발지:{' '}
              <strong className="font-semibold">{settings.origin.name}</strong>)
            </p>
          ))}


        {candidates && candidates.length > 0 && (
          <ul className="mt-2 divide-y divide-navy-100 overflow-hidden rounded-xl border border-navy-200">
            {candidates.map((c) => (
              <li key={`${c.name}-${c.lat}-${c.lng}`}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-navy-50"
                  onClick={() => {
                    patch({ origin: c });
                    setCandidates(null);
                    setQuery(c.name);
                  }}
                >
                  <span className="text-[14px] font-semibold text-navy-900">{c.name}</span>
                  <span className="text-[12px] text-navy-400">{c.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-2 text-[12.5px] text-rose-600">{error}</p>}

      </div>

      {/* 날짜 / 시간 */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="trip-date">
            <Calendar size={12} className="mr-1 inline align-[-1px]" />
            방문 날짜
          </label>
          <input
            id="trip-date"
            type="date"
            className="input tnum"
            value={settings.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
          <p className="mt-1 text-[11.5px] text-navy-400">{formatDateKo(settings.date)} 기준 휴무 반영</p>
        </div>
        <div>
          <label className="label" htmlFor="start-time">
            <Clock size={12} className="mr-1 inline align-[-1px]" />
            출발 시간
          </label>
          <input
            id="start-time"
            type="time"
            step={300}
            className="input tnum"
            value={settings.startTime}
            onChange={(e) => patch({ startTime: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="end-time">
            <Clock size={12} className="mr-1 inline align-[-1px]" />
            희망 종료 시간
          </label>
          <input
            id="end-time"
            type="time"
            step={300}
            className="input tnum"
            value={settings.endTime}
            onChange={(e) => patch({ endTime: e.target.value })}
          />
        </div>
      </div>

      {/* 이동수단 */}
      <div className="mt-5">
        <span className="label">이동수단</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODE_LIST.map((m) => {
            const active = settings.mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => patch({ mode: m.key as TransportMode })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-navy-200 bg-white hover:bg-navy-50'
                }`}
              >
                <span
                  className={`block text-[14px] font-bold ${active ? 'text-brand-700' : 'text-navy-800'}`}
                >
                  {m.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-navy-400">
                  {m.speedKmh}km/h 기준
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-navy-400">
          이동시간은 실시간 교통정보가 아니라 직선거리 · 이동수단 평균속도 기반 <strong>추정값</strong>
          입니다.
        </p>
      </div>
    </section>
  );
}
