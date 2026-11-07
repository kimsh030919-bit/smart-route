import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * 배포 경로(base)
   *  - 기본            : '/'            도메인 루트에 배포 (Vercel, Netlify, Cloudflare Pages …)
   *  - mode=relative   : './'           하위 폴더/FTP 웹호스팅에 dist를 그대로 올릴 때
   *  - mode=github     : '/저장소명/'    GitHub Pages (VITE_BASE로 저장소명 지정)
   *  - VITE_BASE 지정 시 그 값이 최우선
   */
  const base =
    env.VITE_BASE || (mode === 'relative' ? './' : mode === 'github' ? '/smart-route/' : '/')

  // 브이월드 JSON API(검색/지오코더/데이터)는 브라우저에서 직접 호출하면 CORS에 막힌다.
  // 개발 서버에서 /vworld-api/* 를 https://api.vworld.kr/* 로 프록시하고,
  // 인증키에 등록한 "활용 URL"을 Referer로 붙여 준다.
  // (배포 환경에서는 api/·netlify/·functions/ 의 서버리스 함수가 같은 역할을 한다)
  const referer = env.VWORLD_REFERER || 'http://localhost:5173'

  return {
    base,
    plugins: [react()],
    build: {
      // OpenLayers(브이월드 지도)는 별도 청크로 분리되므로 경고 기준을 올려 둔다
      chunkSizeWarningLimit: 700,
    },
    server: {
      proxy: {
        '/vworld-api': {
          target: 'https://api.vworld.kr',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/vworld-api/, ''),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          configure: (proxy: any) => {
            proxy.on('proxyReq', (proxyReq: { setHeader: (k: string, v: string) => void }) => {
              proxyReq.setHeader('Referer', referer)
              proxyReq.setHeader('Origin', referer)
            })
          },
        },
      },
    },
  }
})
