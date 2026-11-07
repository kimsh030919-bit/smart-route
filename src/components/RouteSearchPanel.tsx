import { useState } from 'react';
import { ArrowRightLeft, Calendar, Clock, Flag, Loader2, Navigation, Search, Target } from 'lucide-react';
import type { Category, Origin, RouteSearchParams, TransportMode } from '../types';
import { CATEGORY_LIST } from '../data/categories';
import { MODE_LIST } from '../lib/travel';
import { searchOrigin } from '../lib/placeSearch';
import { SAMPLE_ROUTES } from '../data/storeSeed';
import { formatDateKo } from '../lib/time';
import { describeSupport } from '../lib/routing';

interface Props {
  params: RouteSearchParams;
  onChange: (next: RouteSearchParams) => void;
  onSearch: () => void;
  loading: boolean;
  canSearchPlaces: boolean;
}

type Field = 'origin' | 'destination';

export function RouteSearchPanel({ params, onChange, onSearch, loading, canSearchPlaces }: Props) {
  const [query, setQuery] = useState<Record<Field, string>>({ origin: '', destination: '' });
  const [results, setResults] = useState<{ field: Field; items: Origin[] } | null>(null);
  const [searching, setSearching] = useState<Field | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<RouteSearchParams>) => onChange({ ...params, ...p });
  const support = describeSupport(params.mode);

  async function runSearch(field: Field, e: React.FormEvent) {
    e.preventDefault();
    const q = query[field].trim();
    if (!q) return;
    if (!canSearchPlaces) {
      setError('지도 API 키가 없어 주소 검색을 쓸 수 없습니다. 아래 예시 경로를 사용해 주세요.');
      return;
    }
    setSearching(field);
    setError(null);
    try {
      const items = await searchOrigin(q);
      setResults({ field, items });
      if (items.length === 0) setError('검색 결과가 없습니다. 다른 키워드로 시도해 보세요.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '검색 중 오류가 발생했습니다.');
    } finally {
      setSearching(null);
    }
  }

  const toggleCategory = (c: Category) => {
    const set = new Set(params.categories);
    if (set.has(c)) set.delete(c);
    else set.add(c);
    patch({ categories: [...set] });
  };

  const renderPoint = (field: Field, label: string, icon: React.ReactNode, value: Origin) => (
    <div>
      <span className="label flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <form onSubmit={(e) => runSearch(field, e)} className="flex gap-2">
        <input
          className="input"
          placeholder={canSearchPlaces ? '예) 진주시청, 진주성' : '예시 경로를 사용해 주세요'}
          value={query[field]}
          onChange={(e) => setQuery((q) => ({ ...q, [field]: e.target.value }))}
        />
        <button
          type="submit"
          className="btn-secondary shrink-0 px-3"
          disabled={searching !== null || !canSearchPlaces}
          aria-label={`${label} 검색`}
        >
          {searching === field ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </form>
      <p className="mt-1.5 truncate text-[12.5px] text-navy-500">
        현재: <strong className="font-semibold text-navy-800">{value.name}</strong>
        <span className="text-navy-400"> · {value.address}</span>
      </p>
      {results?.field === field && results.items.length > 0 && (
        <ul className="mt-2 max-h-48 divide-y divide-navy-100 overflow-y-auto rounded-xl border border-navy-200">
          {results.items.map((item) => (
            <li key={`${item.name}-${item.lat}-${item.lng}`}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-navy-50"
                onClick={() => {
                  patch(field === 'origin' ? { origin: item } : { destination: item });
                  setResults(null);
                  setQuery((q) => ({ ...q, [field]: '' }));
                }}
              >
                <span className="text-[14px] font-semibold text-navy-900">{item.name}</span>
                <span className="text-[12px] text-navy-400">{item.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section className="card p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-[16px] font-bold text-navy-900">
        <Navigation size={17} className="text-brand-600" />
        출발지 · 도착지 설정
      </h3>

      <div className="mt-4 space-y-4">
        {renderPoint('origin', '출발지', <Flag size={12} className="text-emerald-600" />, params.origin)}

        <div className="flex justify-center">
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-[12px]"
            onClick={() => patch({ origin: params.destination, destination: params.origin })}
          >
            <ArrowRightLeft size={13} />
            출발지 ↔ 도착지 바꾸기
          </button>
        </div>

        {renderPoint('destination', '도착지', <Target size={12} className="text-rose-600" />, params.destination)}
      </div>

      {error && <p className="mt-3 text-[12.5px] text-rose-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {SAMPLE_ROUTES.map((r) => (
          <button
            key={r.id}
            type="button"
            className="chip border border-navy-200 bg-white text-navy-600 hover:bg-navy-50"
            onClick={() => patch({ origin: { ...r.origin }, destination: { ...r.destination } })}
          >
            예시: {r.label}
          </button>
        ))}
      </div>

      {/* 날짜 / 시간 */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="route-date">
            <Calendar size={12} className="mr-1 inline align-[-1px]" />
            방문 날짜
          </label>
          <input
            id="route-date"
            type="date"
            className="input tnum"
            value={params.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
          <p className="mt-1 text-[11.5px] text-navy-400">{formatDateKo(params.date)} 휴무 반영</p>
        </div>
        <div>
          <label className="label" htmlFor="route-time">
            <Clock size={12} className="mr-1 inline align-[-1px]" />
            출발 시간
          </label>
          <input
            id="route-time"
            type="time"
            step={300}
            className="input tnum"
            value={params.startTime}
            onChange={(e) => patch({ startTime: e.target.value })}
          />
        </div>
      </div>

      {/* 이동수단 */}
      <div className="mt-5">
        <span className="label">이동수단</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODE_LIST.map((m) => {
            const active = params.mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => patch({ mode: m.key as TransportMode })}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active ? 'border-brand-600 bg-brand-50' : 'border-navy-200 bg-white hover:bg-navy-50'
                }`}
              >
                <span className={`block text-[14px] font-bold ${active ? 'text-brand-700' : 'text-navy-800'}`}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-navy-400">{support.label}</p>
      </div>

      {/* 업종 */}
      <div className="mt-5">
        <span className="label">검색할 장소 종류 {params.categories.length === 0 && '(전체)'}</span>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_LIST.map((c) => {
            const active = params.categories.includes(c.key);
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCategory(c.key)}
                className={`chip border ${
                  active
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-navy-200 text-navy-500 hover:bg-navy-50'
                }`}
              >
                <Icon size={12} />
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 반경 */}
      <div className="mt-5">
        <label className="label" htmlFor="radius">
          경로 주변 검색 범위 · <span className="tnum text-brand-700">{params.radiusKm}km</span>
        </label>
        <input
          id="radius"
          type="range"
          min={0.2}
          max={5}
          step={0.1}
          value={params.radiusKm}
          onChange={(e) => patch({ radiusKm: Number(e.target.value) })}
          className="w-full accent-brand-600"
        />
        <p className="mt-1 text-[11.5px] text-navy-400">
          경로 중심선에서 이 거리 안에 있는 장소만 추천합니다. (최대 {params.limit}곳)
        </p>
      </div>

      <button type="button" onClick={onSearch} disabled={loading} className="btn-primary mt-5 w-full py-3.5 text-[16px]">
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
        {loading ? '경로 주변 장소 찾는 중…' : '경로 주변 장소 검색'}
      </button>
    </section>
  );
}
