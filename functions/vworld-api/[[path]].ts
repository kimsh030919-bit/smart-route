/**
 * Cloudflare Pages Functions — 브이월드 JSON API 프록시
 *
 * /vworld-api/* 요청을 https://api.vworld.kr/* 로 중계한다.
 *
 * 환경변수 (Cloudflare Pages → Settings → Environment variables)
 *  - VWORLD_API_KEY (선택) 서버에서 키 주입
 *  - VWORLD_REFERER (권장) 인증키에 등록한 활용 URL (예: https://smart-route.pages.dev)
 */

interface Env {
  VWORLD_API_KEY?: string;
  VWORLD_REFERER?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

const ALLOWED_PATHS = ['/req/search', '/req/address', '/req/data', '/req/wmts'];

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  const incoming = new URL(request.url);
  const path = incoming.pathname.replace(/^\/vworld-api/, '');

  if (!ALLOWED_PATHS.some((p) => path.startsWith(p))) {
    return new Response(JSON.stringify({ error: `허용되지 않은 경로입니다: ${path}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const params = incoming.searchParams;
  if (env.VWORLD_API_KEY) params.set('key', env.VWORLD_API_KEY);

  try {
    const upstream = await fetch(`https://api.vworld.kr${path}?${params.toString()}`, {
      headers: {
        Referer: env.VWORLD_REFERER ?? '',
        'User-Agent': 'smart-route-proxy',
      },
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=600',
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: '브이월드 API 중계에 실패했습니다.',
        detail: e instanceof Error ? e.message : String(e),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
};
