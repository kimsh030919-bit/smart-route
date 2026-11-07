/**
 * Vercel 서버리스 함수 — 브이월드 JSON API 프록시
 *
 * 브라우저 → /vworld-api/req/search?... → (vercel.json rewrite) → /api/vworld/req/search?...
 *          → 이 함수가 Referer를 붙여 https://api.vworld.kr/req/search?... 로 중계
 *
 * 환경변수 (Vercel 프로젝트 설정)
 *  - VWORLD_API_KEY  (선택) 서버에서 키를 주입하고 싶을 때. 설정하면 클라이언트가 보낸 key를 덮어쓴다.
 *  - VWORLD_REFERER  (권장) 브이월드 인증키에 등록한 "활용 URL" (예: https://smart-route.vercel.app)
 */

interface VercelRequest {
  url?: string;
  method?: string;
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

const ALLOWED_PATHS = ['/req/search', '/req/address', '/req/data', '/req/wmts'];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const incoming = new URL(req.url ?? '/', 'http://localhost');
  const path = incoming.pathname.replace(/^\/api\/vworld/, '').replace(/^\/vworld-api/, '');

  if (!ALLOWED_PATHS.some((p) => path.startsWith(p))) {
    res.status(400).send(JSON.stringify({ error: `허용되지 않은 경로입니다: ${path}` }));
    return;
  }

  const params = incoming.searchParams;
  if (process.env.VWORLD_API_KEY) params.set('key', process.env.VWORLD_API_KEY);

  const target = `https://api.vworld.kr${path}?${params.toString()}`;

  try {
    const upstream = await fetch(target, {
      headers: {
        Referer: process.env.VWORLD_REFERER ?? '',
        'User-Agent': 'smart-route-proxy',
      },
    });
    const body = await upstream.text();
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
    );
    // 같은 응답을 짧게 캐시 (브이월드 일일 호출 한도 절약)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600');
    res.status(upstream.status).send(body);
  } catch (e) {
    res
      .status(502)
      .send(
        JSON.stringify({
          error: '브이월드 API 중계에 실패했습니다.',
          detail: e instanceof Error ? e.message : String(e),
        }),
      );
  }
}
