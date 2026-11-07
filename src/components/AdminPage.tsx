import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Database,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Category, Store, StoreDataKind } from '../types';
import { CATEGORY_LIST, CATEGORY_META } from '../data/categories';
import {
  bulkUpsert,
  deleteStore,
  emptyStore,
  exportJson,
  getStats,
  getStores,
  resetToSeed,
  subscribe,
  upsertStore,
} from '../lib/storeDb';
import { HoursEditor } from './HoursEditor';
import { breaksSummary, closedDaysSummary, hoursSummary } from '../lib/businessHours';
import { todayISO } from '../lib/time';
import { searchPlaces } from '../lib/placeSearch';

const SAMPLE_JSON = `[
  {
    "name": "장소 이름",
    "category": "cafe",
    "address": "경상남도 진주시 ...",
    "lat": 35.1803,
    "lng": 128.1087,
    "stayMinutes": 60,
    "dataKind": "real",
    "verifiedAt": "2026-11-07",
    "sourceUrl": "https://...",
    "business": {
      "verified": true,
      "open": "10:00",
      "close": "21:00",
      "lastOrder": "20:30",
      "breaks": [{ "start": "15:00", "end": "17:00" }],
      "closedWeekdays": [1],
      "temporarilyClosed": false
    },
    "tempClosures": [{ "date": "2026-12-25", "reason": "휴무" }]
  }
]`;

export function AdminPage() {
  const [stores, setStores] = useState<Store[]>(() => getStores());
  const [editing, setEditing] = useState<Store | null>(null);
  const [keyword, setKeyword] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => subscribe(setStores), []);

  const stats = useMemo(() => getStats(stores), [stores]);
  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter((s) => `${s.name} ${s.address} ${s.category}`.toLowerCase().includes(q));
  }, [stores, keyword]);

  const handleDownload = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-route-stores-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="flex items-center gap-2 text-[26px] font-extrabold tracking-tight text-navy-900 sm:text-[30px]">
        <Database size={24} className="text-brand-600" />
        장소 정보 관리
      </h2>
      <p className="mt-2.5 text-[15px] leading-relaxed text-navy-500">
        여기에 등록한 영업시간·휴무일·브레이크 타임이 사용자 경로 추천에 <strong>즉시</strong> 반영됩니다.
        확인하지 못한 정보는 비워 두세요. 비워 두면 &lsquo;정보 없음&rsquo;으로 표시되고 임의로 추측하지
        않습니다.
      </p>

      {/* 통계 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: '등록 장소', value: `${stats.total}곳`, sub: '전체' },
          { label: '실제 확인', value: `${stats.real}곳`, sub: '출처 보유' },
          { label: '데모 데이터', value: `${stats.demo}곳`, sub: '가상 장소' },
          { label: '영업시간 확보', value: `${stats.withHours}곳`, sub: '시간 제약 적용' },
          { label: '브레이크 등록', value: `${stats.withBreaks}곳`, sub: '휴게시간 보유' },
          { label: '정보 미확인', value: `${stats.unverified}곳`, sub: '확인 필요' },
        ].map((s) => (
          <div key={s.label} className="card px-4 py-3">
            <p className="text-[11.5px] font-semibold text-navy-400">{s.label}</p>
            <p className="tnum mt-1 text-[18px] font-extrabold text-navy-900">{s.value}</p>
            <p className="text-[11px] text-navy-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* 툴바 */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
          <input
            className="input pl-9"
            placeholder="장소 이름 · 주소 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary px-4 py-2.5" onClick={() => setEditing(emptyStore())}>
          <Plus size={16} />
          장소 신규 등록
        </button>
        <button type="button" className="btn-secondary" onClick={() => setBulkOpen((v) => !v)}>
          <Upload size={15} />
          일괄 업로드
        </button>
        <button type="button" className="btn-secondary" onClick={handleDownload}>
          <Download size={15} />
          JSON 내보내기
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            if (confirm('등록한 장소 정보를 모두 지우고 기본 시드 데이터로 되돌릴까요?')) {
              setStores(resetToSeed());
              setMessage('시드 데이터로 초기화했습니다.');
            }
          }}
        >
          <RotateCcw size={15} />
          초기화
        </button>
      </div>

      {message && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800">{message}</p>
      )}

      {bulkOpen && (
        <section className="card mt-4 p-5">
          <h3 className="text-[15px] font-bold text-navy-900">JSON 일괄 업로드</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-navy-500">
            배열 형태의 JSON을 붙여 넣으세요. <code className="rounded bg-navy-100 px-1">id</code>가 같으면
            덮어쓰고, 없으면 새로 추가합니다. 영업시간이 없는 항목은 자동으로 &lsquo;정보 없음&rsquo;
            처리됩니다.
          </p>
          <textarea
            className="input scroll-thin mt-3 h-48 font-mono text-[12px]"
            placeholder={SAMPLE_JSON}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary px-4 py-2.5"
              onClick={() => {
                const r = bulkUpsert(bulkText);
                setStores(getStores());
                setMessage(
                  `업로드 완료 — 추가 ${r.added}건, 수정 ${r.updated}건, 건너뜀 ${r.skipped}건` +
                    (r.errors.length ? ` / 오류: ${r.errors.slice(0, 3).join(' · ')}` : ''),
                );
              }}
            >
              <Upload size={15} />
              업로드 실행
            </button>
            <button type="button" className="btn-secondary" onClick={() => setBulkText(SAMPLE_JSON)}>
              예시 채우기
            </button>
            <input
              type="file"
              accept="application/json"
              className="text-[12.5px] text-navy-500"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBulkText(await file.text());
              }}
            />
          </div>
        </section>
      )}

      {/* 목록 */}
      <div className="scroll-thin mt-6 overflow-x-auto">
        <table className="w-full min-w-[840px] border-collapse text-left">
          <thead>
            <tr className="border-b border-navy-200 text-[12px] font-semibold text-navy-500">
              <th className="px-3 py-2.5">장소</th>
              <th className="px-3 py-2.5">업종</th>
              <th className="px-3 py-2.5">영업시간</th>
              <th className="px-3 py-2.5">휴무</th>
              <th className="px-3 py-2.5">브레이크</th>
              <th className="px-3 py-2.5">최종 확인</th>
              <th className="px-3 py-2.5">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const meta = CATEGORY_META[s.category];
              return (
                <tr key={s.id} className="border-b border-navy-100 text-[13px] text-navy-700">
                  <td className="px-3 py-3">
                    <p className="font-bold text-navy-900">
                      {s.name}
                      {s.dataKind === 'demo' && (
                        <span className="ml-1.5 chip bg-navy-100 text-navy-600">데모</span>
                      )}
                    </p>
                    <p className="text-[11.5px] text-navy-400">{s.address}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`chip ${meta.bg}`}>{meta.label}</span>
                  </td>
                  <td className="px-3 py-3 tnum">{hoursSummary(s.business)}</td>
                  <td className="px-3 py-3">
                    {closedDaysSummary(s.business)}
                    {s.tempClosures.length > 0 && (
                      <span className="ml-1 chip bg-rose-50 text-rose-700">
                        임시 {s.tempClosures.length}건
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {s.business.breaks.length > 0 ? breaksSummary(s.business) : '정보 없음'}
                  </td>
                  <td className="px-3 py-3 tnum">
                    {s.verifiedAt ?? <span className="text-amber-700">미확인</span>}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1"
                        onClick={() => setEditing(s)}
                        aria-label={`${s.name} 수정`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost px-2 py-1 text-rose-500 hover:bg-rose-50"
                        onClick={() => {
                          if (confirm(`"${s.name}" 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) {
                            setStores(deleteStore(s.id));
                          }
                        }}
                        aria-label={`${s.name} 삭제`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="py-10 text-center text-[13.5px] text-navy-500">검색 결과가 없습니다.</p>
        )}
      </div>

      {editing && (
        <StoreEditor
          store={editing}
          onClose={() => setEditing(null)}
          onSave={(s) => {
            setStores(upsertStore(s));
            setEditing(null);
            setMessage(`"${s.name}" 저장 완료. 사용자 경로 추천에 즉시 반영됩니다.`);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── 등록/수정 폼 ───────────────────────────── */

function StoreEditor({
  store,
  onClose,
  onSave,
}: {
  store: Store;
  onClose: () => void;
  onSave: (s: Store) => void;
}) {
  const [draft, setDraft] = useState<Store>({ ...store, tempClosures: [...store.tempClosures] });
  const [lookup, setLookup] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookError, setLookError] = useState<string | null>(null);

  const patch = (p: Partial<Store>) => setDraft((d) => ({ ...d, ...p }));

  async function findCoords() {
    if (!lookup.trim()) return;
    setLooking(true);
    setLookError(null);
    try {
      const res = await searchPlaces(lookup.trim(), null);
      const first = res.results[0];
      if (!first) {
        setLookError('검색 결과가 없습니다.');
        return;
      }
      patch({
        name: draft.name || first.name,
        address: first.address,
        lat: first.lat,
        lng: first.lng,
        category: draft.category === 'cafe' ? first.category : draft.category,
      });
    } catch (e) {
      setLookError(e instanceof Error ? e.message : '좌표 검색에 실패했습니다.');
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/40 p-4">
      <div className="card my-8 w-full max-w-2xl p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-[18px] font-extrabold text-navy-900">
            {store.name ? '장소 정보 수정' : '장소 신규 등록'}
          </h3>
          <button type="button" className="btn-ghost px-2 py-1" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="st-name">
              장소 이름
            </label>
            <input
              id="st-name"
              className="input"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="예) 국립진주박물관"
            />
          </div>

          <div className="sm:col-span-2">
            <span className="label">주소/좌표 자동 입력 (브이월드·카카오 검색)</span>
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="장소명 또는 주소로 검색"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary shrink-0 px-3"
                onClick={findCoords}
                disabled={looking}
              >
                <Search size={15} />
              </button>
            </div>
            {lookError && <p className="mt-1 text-[12px] text-rose-600">{lookError}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="st-addr">
              주소
            </label>
            <input
              id="st-addr"
              className="input"
              value={draft.address}
              onChange={(e) => patch({ address: e.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="st-lat">
              위도
            </label>
            <input
              id="st-lat"
              type="number"
              step="0.000001"
              className="input tnum"
              value={draft.lat}
              onChange={(e) => patch({ lat: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="label" htmlFor="st-lng">
              경도
            </label>
            <input
              id="st-lng"
              type="number"
              step="0.000001"
              className="input tnum"
              value={draft.lng}
              onChange={(e) => patch({ lng: Number(e.target.value) })}
            />
          </div>

          <div>
            <span className="label">업종</span>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_LIST.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => patch({ category: c.key as Category })}
                  className={`chip border ${
                    draft.category === c.key
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-navy-200 text-navy-500 hover:bg-navy-50'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="st-stay">
              예상 체류시간(분)
            </label>
            <input
              id="st-stay"
              type="number"
              min={5}
              step={5}
              className="input tnum"
              value={draft.stayMinutes}
              onChange={(e) => patch({ stayMinutes: Math.max(5, Number(e.target.value) || 30) })}
            />
          </div>

          <div>
            <label className="label" htmlFor="st-verified">
              정보 최종 확인 날짜
            </label>
            <input
              id="st-verified"
              type="date"
              className="input tnum"
              value={draft.verifiedAt ?? ''}
              onChange={(e) => patch({ verifiedAt: e.target.value || undefined })}
            />
          </div>

          <div>
            <label className="label" htmlFor="st-source">
              출처 (URL/기관)
            </label>
            <input
              id="st-source"
              className="input"
              placeholder="https://..."
              value={draft.sourceUrl ?? ''}
              onChange={(e) => patch({ sourceUrl: e.target.value || undefined })}
            />
          </div>

          <div className="sm:col-span-2">
            <span className="label">데이터 종류</span>
            <div className="flex gap-1.5">
              {(['real', 'demo'] as StoreDataKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => patch({ dataKind: k })}
                  className={`chip border ${
                    draft.dataKind === k
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-navy-200 text-navy-500 hover:bg-navy-50'
                  }`}
                >
                  {k === 'real' ? '실제 확인 데이터' : '데모(가상) 데이터'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 영업정보 */}
        <HoursEditor info={draft.business} onChange={(business) => patch({ business })} />

        {/* 임시 휴무 */}
        <div className="mt-4 rounded-xl border border-navy-100 bg-navy-50/60 p-3.5">
          <p className="text-[13px] font-bold text-navy-800">임시 휴무일</p>
          <div className="mt-2 space-y-2">
            {draft.tempClosures.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="date"
                  className="input tnum px-2 py-1.5 text-[13px]"
                  value={t.date}
                  onChange={(e) => {
                    const next = [...draft.tempClosures];
                    next[i] = { ...next[i], date: e.target.value };
                    patch({ tempClosures: next });
                  }}
                />
                <input
                  className="input px-2 py-1.5 text-[13px]"
                  placeholder="사유 (선택)"
                  value={t.reason ?? ''}
                  onChange={(e) => {
                    const next = [...draft.tempClosures];
                    next[i] = { ...next[i], reason: e.target.value };
                    patch({ tempClosures: next });
                  }}
                />
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-2 py-1 text-rose-500 hover:bg-rose-50"
                  onClick={() => patch({ tempClosures: draft.tempClosures.filter((_, idx) => idx !== i) })}
                  aria-label="임시 휴무 삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary mt-2 px-2.5 py-1.5 text-[12.5px]"
            onClick={() => patch({ tempClosures: [...draft.tempClosures, { date: todayISO() }] })}
          >
            <Plus size={13} />
            임시 휴무일 추가
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn-primary px-5 py-2.5"
            disabled={!draft.name.trim()}
            onClick={() => onSave(draft)}
          >
            <Check size={16} />
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
