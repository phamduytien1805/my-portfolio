// Is the chat's AI reachable? The chat calls this when it opens, to show Tien as online
// (green dot) or offline (grey dot, auto-reply).
//
// Checks the API key is set, then asks OpenAI to look up the chat's model: that's free (no
// tokens), and fails on a missing or bad key, a model the key can't use, or OpenAI being
// down. The answer is cached for a minute so opening the chat doesn't hit OpenAI every time.

export const dynamic = 'force-dynamic';

const MODEL = 'gpt-4o-mini'; // keep in sync with ../route.ts
const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;

let cached: { online: boolean; at: number } | null = null;

async function checkProvider(): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn('[CHAT-HEALTH] OPENAI_API_KEY is not set');
    return false;
  }
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  try {
    const res = await fetch(`${baseUrl}/models/${MODEL}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!res.ok) console.warn('[CHAT-HEALTH] OpenAI answered', res.status);
    return res.ok;
  } catch (err) {
    console.warn('[CHAT-HEALTH] OpenAI unreachable:', err);
    return false;
  }
}

export async function GET() {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    cached = { online: await checkProvider(), at: Date.now() };
  }
  // Only online/offline goes to the browser; the reason stays in the server log.
  return Response.json(
    { online: cached.online },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
