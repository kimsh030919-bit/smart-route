# SMART ROUTE 배포 가이드

빌드 결과물은 `dist/` 폴더의 **정적 파일**입니다. 다만 브이월드 **검색·지오코더(JSON API)** 는 CORS 때문에
브라우저에서 직접 호출할 수 없어, 중계용 서버리스 함수가 필요합니다. 그래서 플랫폼별로 아래처럼 갈립니다.

| 플랫폼 | 설정 파일 | 브이월드 지도 타일 | 브이월드 검색/지오코더 | 카카오맵 | 데모 모드 |
| --- | --- | --- | --- | --- | --- |
| **Vercel** (권장) | `vercel.json` + `api/vworld/[...path].ts` | ✅ | ✅ | ✅ | ✅ |
| **Netlify** | `netlify.toml` + `netlify/functions/vworld.mts` | ✅ | ✅ | ✅ | ✅ |
| **Cloudflare Pages** | `functions/vworld-api/[[path]].ts` | ✅ | ✅ | ✅ | ✅ |
| **GitHub Pages** | `.github/workflows/deploy-pages.yml` | ✅ | ❌ (함수 불가) | ✅ | ✅ |
| **일반 웹호스팅 / FTP** | `npm run build:relative` | ✅ | ❌ | ✅ | ✅ |

> 어느 플랫폼이든 **데모 모드는 100% 동작**합니다. 키가 없어도 검색·최적화·타임라인·지도(개념도)가 모두
> 작동하므로, 발표용으로는 키 없이 배포해도 시연에 문제가 없습니다.

---

## 공통: 키를 쓸 경우 도메인 등록이 필수

| 키 | 발급처 | 등록해야 하는 곳 |
| --- | --- | --- |
| `VITE_KAKAO_MAP_KEY` (JavaScript 키) | developers.kakao.com | 내 애플리케이션 → 플랫폼 → Web → **사이트 도메인**에 배포 URL 추가 |
| `VITE_VWORLD_API_KEY` (인증키) | vworld.kr | 인증키 관리 → **활용 URL**에 배포 URL 추가 |

`http://localhost:5173` 과 배포 URL을 **둘 다** 등록해 두면 개발/배포 양쪽에서 동작합니다.
도메인을 등록하지 않으면 키가 유효해도 지도·검색이 실패합니다.

### 환경변수 정리

| 이름 | 노출 | 용도 |
| --- | --- | --- |
| `VITE_KAKAO_MAP_KEY` | 클라이언트 | 카카오맵 SDK |
| `VITE_VWORLD_API_KEY` | 클라이언트 | 브이월드 **타일**(이미지 URL이라 불가피) + 프록시로 보내는 기본 키 |
| `VWORLD_API_KEY` | **서버만** | 서버리스 함수가 키를 주입. 설정하면 클라이언트 키를 덮어씀 |
| `VWORLD_REFERER` | **서버만** | 함수가 브이월드에 보낼 Referer. **인증키의 활용 URL과 똑같이** 적어야 함 |
| `VITE_VWORLD_PROXY_BASE` | 클라이언트 | 프록시 경로 변경(기본 `/vworld-api`) |
| `VITE_BASE` | 빌드 시 | 하위 경로 배포 시 base 경로 |

브이월드 검색을 쓰려면 운영에서는 `VWORLD_API_KEY` + `VWORLD_REFERER`(서버 전용)만 설정하는 쪽이 안전합니다.

---

## 1. Vercel (가장 쉬움 · 브이월드 검색까지 동작)

```bash
npm i -g vercel
vercel          # 최초 1회: 프로젝트 생성
vercel --prod   # 운영 배포
```

또는 GitHub 저장소를 Vercel에 import하면 `vercel.json`을 읽어 자동 설정됩니다.

Vercel 대시보드 → Settings → Environment Variables 에 추가:

```
VITE_VWORLD_API_KEY = 브이월드 인증키        # 타일용(클라이언트)
VWORLD_API_KEY      = 브이월드 인증키        # 함수용(서버)
VWORLD_REFERER      = https://내프로젝트.vercel.app
VITE_KAKAO_MAP_KEY  = 카카오 JavaScript 키   # (선택)
```

동작 구조:

```
브라우저 /vworld-api/req/search?...
  → vercel.json rewrite → /api/vworld/req/search?...
  → api/vworld/[...path].ts 가 Referer 붙여 https://api.vworld.kr/req/search 로 중계
```

## 2. Netlify

```bash
npm i -g netlify-cli
netlify deploy --build          # 미리보기
netlify deploy --build --prod   # 운영
```

환경변수는 Site configuration → Environment variables 에 위와 동일하게 추가하고,
`VWORLD_REFERER`는 `https://내사이트.netlify.app` 로 지정합니다.
함수는 `netlify/functions/vworld.mts` 가 `config.path = '/vworld-api/*'` 로 직접 라우팅됩니다.

## 3. Cloudflare Pages

```bash
npm i -g wrangler
npm run build
wrangler pages deploy dist
```

Cloudflare 대시보드 → Settings → Environment variables 에 `VWORLD_API_KEY`, `VWORLD_REFERER` 추가.
`functions/vworld-api/[[path]].ts` 가 자동으로 `/vworld-api/*` 를 처리합니다.
(GitHub 연동 배포 시 빌드 명령 `npm run build`, 출력 디렉터리 `dist`)

## 4. GitHub Pages

1. 저장소 **Settings → Pages → Source: GitHub Actions**
2. (선택) **Settings → Secrets and variables → Actions → Variables** 에
   `VITE_KAKAO_MAP_KEY`, `VITE_VWORLD_API_KEY` 추가
3. `main` 브랜치에 push → `.github/workflows/deploy-pages.yml` 이 자동 배포

하위 경로(`https://계정.github.io/저장소명/`)에 올라가므로 워크플로가 `VITE_BASE`를 자동으로 넣습니다.
**브이월드 검색·지오코더는 동작하지 않습니다**(서버리스 함수 불가). 지도 타일·카카오맵·데모는 정상입니다.

## 5. 일반 웹호스팅 / FTP / 학교 서버 (파일만 올리는 경우)

```bash
npm run build:relative      # base를 './' 로 빌드 → 어떤 하위 폴더에 올려도 동작
npm run package:win         # dist 를 smart-route-dist.zip 으로 압축 (Windows)
```

`dist/` 안의 파일을 그대로 업로드하면 끝입니다. 주의할 점:

- **`index.html`을 더블클릭(file://)하면 동작하지 않습니다.** ES 모듈이 차단되기 때문에 반드시 HTTP로
  서빙해야 합니다. 로컬 확인은 `npm run serve:dist` → http://localhost:4173
- 브이월드 검색은 프록시가 없어 동작하지 않습니다. 지도 타일·카카오맵·데모 모드는 정상입니다.
- Apache 등에서 하위 경로에 올렸다면 `base`가 `./` 이라 추가 설정이 필요 없습니다.

---

## 배포 후 확인 체크리스트

1. 첫 화면 로드 → 헤더 배지 확인 (`데모 모드` / `브이월드 연결됨` / `카카오맵 연결됨`)
2. **데모 시나리오로 1초 체험** → **최적 동선 만들기** → 지도 + 타임라인 생성 확인
3. 지도 카드의 **지도 소스** 토글로 브이월드/카카오/데모 전환 확인
4. 장소 검색에서 소스 토글 후 실제 검색 1회 (키를 넣었다면)
5. 모바일 폭(개발자도구 375px)에서 레이아웃 확인
6. 브이월드 검색이 실패하면 → 인증키 **활용 URL**과 `VWORLD_REFERER`가 배포 도메인과 같은지 확인
