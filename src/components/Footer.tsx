import { Route } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-navy-100 bg-navy-50/60">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-white">
            <Route size={16} />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight text-navy-900">SMART ROUTE</span>
        </div>
        <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-navy-500">
          SMART ROUTE는 해커톤 프로토타입입니다. 데모 장소 데이터와 영업정보는 알고리즘 시연을 위해
          만든 <strong>가상의 정보</strong>이며 실제 매장 정보가 아닙니다. 이동시간은 실시간 교통정보가
          아니라 직선거리와 이동수단 평균 속도를 이용한 추정값입니다. 영업정보가 확인되지 않은 장소는
          추측하지 않고 &lsquo;정보 확인 필요&rsquo;로 표시합니다.
        </p>
        <p className="mt-4 text-[11.5px] text-navy-400">
          일정 데이터는 서버로 전송되지 않고 브라우저 LocalStorage에만 저장됩니다.
        </p>
      </div>
    </footer>
  );
}
