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
          장소 검색은 브이월드·카카오맵, 영업시간은 <strong>OpenStreetMap</strong>에 등록된 실제
          정보를 사용합니다. 지도에 영업시간이 등록되지 않은 장소는 업종 평균으로 채우거나
          &lsquo;정보 확인 필요&rsquo;로 표시하며, 확인되지 않은 정보를 지어내지 않습니다. 라스트
          오더와 임시 휴무는 어느 지도 API도 제공하지 않아 직접 입력해야 합니다. 이동시간은 실시간
          교통정보가 아니라 도로 경로(OSRM) 또는 직선거리와 이동수단 평균 속도를 이용한
          추정값입니다.
        </p>
        <p className="mt-4 text-[11.5px] text-navy-400">
          일정 데이터는 서버로 전송되지 않고 브라우저 LocalStorage에만 저장됩니다.
        </p>
      </div>
    </footer>
  );
}
