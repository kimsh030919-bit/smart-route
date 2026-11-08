/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // 디자인 시스템: Vivid Editorial
      //   네온 핑크 #FF3366 (포인트) · 잉크 블랙 #18181B (구조/타이포) · 쿨 슬레이트 #71717A (보조)
      //   흰 캔버스 #FFFFFF · 웰 #F8F9FA/#F4F4F5 · 헤어라인 #E4E4E7
      // 컴포넌트는 brand-* / navy-* 토큰만 쓰므로 이 두 팔레트 교체로 전체 색이 바뀐다.
      colors: {
        // 'navy'라는 이름은 유지하되 값은 잉크 블랙 ~ 쿨 슬레이트 스케일
        navy: {
          50: '#f8f9fa',
          100: '#e7e7ea',
          200: '#d9d9de',
          300: '#a1a1aa',
          400: '#71717a',
          500: '#52525b',
          600: '#3f3f46',
          700: '#27272a',
          800: '#1f1f23',
          900: '#18181b',
        },
        brand: {
          50: '#fff0f4',
          100: '#ffe1e9',
          200: '#ffc2d1',
          300: '#ff9bb3',
          400: '#ff6b8f',
          500: '#ff4d79',
          600: '#ff3366',
          700: '#e61e53',
          800: '#c2003c',
          900: '#8f0030',
        },
      },
      fontFamily: {
        sans: [
          // 라틴/숫자는 Plus Jakarta Sans, 한글은 Pretendard로 자연스럽게 폴백
          '"Plus Jakarta Sans"',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Malgun Gothic',
          'Apple SD Gothic Neo',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        // Level 2 카드: 아주 확산된 앰비언트 그림자 + 1px 헤어라인
        card: '0 8px 30px rgba(24, 24, 27, 0.06)',
        pop: '0 12px 32px rgba(24, 24, 27, 0.14)',
        // Level 3 네온 핫스팟: 포인트 버튼/핀의 핑크 글로우
        glow: '0 10px 25px rgba(255, 51, 102, 0.35)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
