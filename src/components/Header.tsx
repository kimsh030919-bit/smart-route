import { Globe2, Route, Sparkles } from 'lucide-react';
import type { KakaoStatus } from '../hooks/useKakaoLoader';
import { hasVworldKey } from '../lib/vworld';

type View = 'route' | 'planner' | 'admin';

interface Props {
  kakaoStatus: KakaoStatus;
  view: View;
  onNavigate: (v: View) => void;
  onStart: () => void;
}

const NAV: { key: View; label: string }[] = [
  { key: 'route', label: '경로 주변 추천' },
  { key: 'planner', label: '하루 일정 플래너' },
  { key: 'admin', label: '가게 정보 관리' },
];

const STATUS_TEXT: Record<KakaoStatus, { label: string; cls: string }> = {
  demo: { label: '데모 모드 (지도 API 키 없음)', cls: 'bg-amber-50 text-amber-700' },
  loading: { label: '카카오맵 불러오는 중', cls: 'bg-navy-50 text-navy-600' },
  ready: { label: '카카오맵 연결됨', cls: 'bg-emerald-50 text-emerald-700' },
  error: { label: '지도 연결 실패 · 데모 모드', cls: 'bg-rose-50 text-rose-700' },
};

export function Header({ kakaoStatus, view, onNavigate, onStart }: Props) {
  // 카카오 상태는 "연결됨 / 오류"일 때만 노출한다.
  // (브이월드만 쓰는 경우 "카카오맵 키 없음" 배지는 불필요한 노이즈)
  // 지도 키가 하나도 없을 때는 데모 모드임을 반드시 알린다.
  const showKakaoStatus =
    kakaoStatus === 'ready' || kakaoStatus === 'error' || !hasVworldKey();
  const status = STATUS_TEXT[kakaoStatus];
  return (
    <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => onNavigate('route')}
          className="flex shrink-0 items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Route size={19} strokeWidth={2.4} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[17px] font-extrabold tracking-tight text-navy-900">
              SMART ROUTE
            </span>
            <span className="mt-0.5 text-[11px] font-medium text-navy-400">
              AI 스마트 동선 플래너
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              onClick={() => onNavigate(n.key)}
              className={`rounded-lg px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${
                view === n.key ? 'bg-brand-50 text-brand-700' : 'text-navy-500 hover:bg-navy-50'
              }`}
            >
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {hasVworldKey() && (
            <span className="chip hidden bg-emerald-50 text-emerald-700 sm:inline-flex">
              <Globe2 size={13} />
              브이월드 연결됨
            </span>
          )}
          {showKakaoStatus && (
            <span className={`chip hidden sm:inline-flex ${status.cls}`}>
              <Sparkles size={13} />
              {status.label}
            </span>
          )}
          <button type="button" onClick={onStart} className="btn-primary px-4 py-2 text-sm">
            나만의 일정 만들기
          </button>
        </div>
      </div>
    </header>
  );
}
