import { useEffect, useRef, useState } from 'react';
// 에셋으로 import 해야 배포 경로(/smart-route/)가 자동으로 붙는다
import heroSeoul from '../assets/hero-seoul.jpg';

/**
 * 상단 히어로 이미지.
 * 스크롤을 내리면 사진이 그라데이션으로 서서히 사라지고, 아래 본문이 자연스럽게 드러난다.
 * (사진 하단은 항상 흰색으로 페이드아웃시켜 페이지와 이어지게 한다)
 */
export function HeroImage() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // 0 = 완전히 보임, 1 = 완전히 사라짐

  useEffect(() => {
    const onScroll = () => {
      const h = ref.current?.offsetHeight ?? 1;
      // 히어로 높이의 85% 만큼 스크롤하면 완전히 사라지도록
      const p = Math.min(1, Math.max(0, window.scrollY / (h * 0.85)));
      setProgress(p);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="relative h-[240px] w-full overflow-hidden bg-white sm:h-[320px] lg:h-[400px]"
    >
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          opacity: 1 - progress,
          // 스크롤에 따라 아주 살짝 확대되며 멀어지는 느낌
          transform: `scale(${1 + progress * 0.06}) translateY(${progress * -24}px)`,
        }}
      >
        <img
          src={heroSeoul}
          alt=""
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        {/* 하단 그라데이션: 사진이 흰 배경으로 자연스럽게 녹아들게 */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent via-white/60 to-white" />
        {/* 상단도 살짝 밝혀 헤더와의 경계를 부드럽게 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/70 to-transparent" />
      </div>
    </div>
  );
}
