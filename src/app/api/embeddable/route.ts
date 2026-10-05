import { viewableLinks } from '@/lib/portfolio';

// Can this website be shown inside the chat's side panel? Many sites forbid being framed by
// another site (X-Frame-Options, or a CSP frame-ancestors rule); the panel then offers to
// open the site in a new tab instead of showing a blank frame. When unsure, it says yes.
//
// Only links from the portfolio data are checked, so this can't be used to fetch anything else.

export const dynamic = 'force-dynamic';

const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { embeddable: boolean; at: number }>();

function allowsFraming(headers: Headers): boolean {
  const xfo = headers.get('x-frame-options')?.toLowerCase();
  if (xfo && (xfo.includes('deny') || xfo.includes('sameorigin'))) return false;
  const csp = headers.get('content-security-policy') ?? '';
  const ancestors = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  // Any frame-ancestors list other than "*" leaves this site out.
  if (ancestors && !/\s\*(\s|$)/.test(ancestors)) return false;
  return true;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get('url') ?? '';
  if (!viewableLinks().includes(url))
    return Response.json({ error: 'Unknown link' }, { status: 400 });

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS)
    return Response.json({ embeddable: hit.embeddable });

  // Only an explicit "don't frame me" counts as blocked. Bot protection often refuses this
  // server-side request (e.g. SAP answers 403) while real visitors get the page, so a failed
  // or refused check means "try showing it"; only definite answers are remembered.
  let embeddable = true;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        accept: 'text/html',
      },
    });
    embeddable = allowsFraming(res.headers);
    await res.body?.cancel();
    if (res.ok) cache.set(url, { embeddable, at: Date.now() });
  } catch {
    // Unreachable from here: let the panel try.
  }
  return Response.json({ embeddable });
}
