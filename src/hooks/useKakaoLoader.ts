import { useEffect, useState } from 'react';

export type KakaoStatus = 'demo' | 'loading' | 'ready' | 'error';

const SCRIPT_ID = 'kakao-maps-sdk';

/** .env 의 VITE_KAKAO_MAP_KEY (JavaScript 키) */
export const KAKAO_APP_KEY: string = (import.meta.env.VITE_KAKAO_MAP_KEY ?? '').trim();

let loadPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경이 아닙니다.'));
      return;
    }
    if (window.kakao?.maps?.Map) {
      resolve();
      return;
    }
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      try {
        window.kakao!.maps.load(() => resolve());
      } catch (e) {
        reject(e instanceof Error ? e : new Error('카카오맵 초기화 실패'));
      }
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', () =>
      reject(new Error('카카오맵 SDK를 불러오지 못했습니다. (키/도메인 등록 확인 필요)')),
    );
    if (!existing) {
      script.id = SCRIPT_ID;
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
        KAKAO_APP_KEY,
      )}&libraries=services&autoload=false`;
      document.head.appendChild(script);
    }
  });
  return loadPromise;
}

/**
 * 카카오맵 SDK 로더.
 * 키가 없으면 'demo' 상태로 두고, 앱은 데모 지도/데모 검색으로 동작한다.
 */
export function useKakaoLoader(): { status: KakaoStatus; error: string | null } {
  const [status, setStatus] = useState<KakaoStatus>(KAKAO_APP_KEY ? 'loading' : 'demo');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!KAKAO_APP_KEY) return;
    let alive = true;
    loadSdk()
      .then(() => {
        if (!alive) return;
        setStatus('ready');
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  return { status, error };
}

export function isKakaoReady(): boolean {
  return typeof window !== 'undefined' && !!window.kakao?.maps?.Map;
}
