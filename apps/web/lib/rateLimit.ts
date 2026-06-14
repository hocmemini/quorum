import { createHmac } from 'node:crypto';
import {
  countAllProvisionAttempts,
  countProvisionAttempts,
  recordProvisionAttempt,
} from '@quorum/api';
import { queryHealthy } from '@/lib/db';

type RateLimitConfig = {
  windowSeconds: number;
  maxPerIp: number;
  globalPerMinute: number | null;
  bypassToken: string | null;
};

function config(): RateLimitConfig {
  return {
    windowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 600),
    maxPerIp: Number(process.env.RATE_LIMIT_MAX_PER_IP ?? 5),
    globalPerMinute: process.env.RATE_LIMIT_GLOBAL_PER_MINUTE
      ? Number(process.env.RATE_LIMIT_GLOBAL_PER_MINUTE)
      : null,
    bypassToken: process.env.RATE_LIMIT_BYPASS_TOKEN || null,
  };
}

// Client IP via Vercel's documented headers (x-forwarded-for first hop, then x-real-ip; Vercel
// overwrites x-forwarded-for to prevent spoofing). A missing IP collapses to one shared bucket so a
// stripped header cannot bypass the limit (DEC-027).
function clientIp(req: Request): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  return req.headers.get('x-real-ip')?.trim() || 'shared';
}

// HMAC of the client IP with a server-side salt; only the hash is stored, never the raw IP.
function ipHash(req: Request): string {
  const salt = process.env.PROVISION_IP_SALT ?? 'quorum-dev-unsalted';
  return createHmac('sha256', salt).update(clientIp(req)).digest('hex');
}

function bypassed(req: Request, cfg: RateLimitConfig): boolean {
  return cfg.bypassToken !== null && req.headers.get('x-ratelimit-bypass') === cfg.bypassToken;
}

/**
 * Enforce the per-IP provision rate limit (DEC-027). Returns { retryAfter } when over the limit
 * (provisions nothing; records no attempt), or null when allowed (records exactly one attempt). The
 * read and the append both use the chaos-immune healthy path (DEC-025), so a drill never breaks it.
 * Count-then-insert is intentionally not atomic: a small concurrent burst from one IP can slip
 * through, which is acceptable for a soft abuse-mitigation control.
 */
export async function checkProvisionRateLimit(
  req: Request,
): Promise<{ retryAfter: number } | null> {
  const cfg = config();
  if (bypassed(req, cfg)) return null;

  const hash = ipHash(req);
  const since = new Date(Date.now() - cfg.windowSeconds * 1000);
  const count = await queryHealthy((db) => countProvisionAttempts(db, hash, since));
  if (count >= cfg.maxPerIp) return { retryAfter: cfg.windowSeconds };

  if (cfg.globalPerMinute !== null) {
    const minuteAgo = new Date(Date.now() - 60_000);
    const total = await queryHealthy((db) => countAllProvisionAttempts(db, minuteAgo));
    if (total >= cfg.globalPerMinute) return { retryAfter: 60 };
  }

  await queryHealthy((db) => recordProvisionAttempt(db, hash));
  return null;
}

/** On-brand 429 page for the /demo GET (a browser navigation), so a throttle never white-screens. */
export function provisionThrottledPage(retryAfter: number): Response {
  const mins = Math.max(1, Math.ceil(retryAfter / 60));
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Quorum - slow down</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0b0e14; color:#e6e9ef;
         font-family: ui-sans-serif, system-ui, sans-serif; }
  .card { max-width:28rem; margin:1rem; padding:2rem; border:1px solid #232a3b; border-radius:.75rem; background:#141925; }
  h1 { font-size:1rem; margin:0 0 .5rem; }
  p { color:#8a93a6; font-size:.875rem; line-height:1.5; margin:.5rem 0; }
  .mono { font-family:ui-monospace,monospace; color:#ffb020; }
  a { color:#4aa3ff; text-decoration:none; font-family:ui-monospace,monospace; font-size:.8rem; }
</style>
</head>
<body>
  <div class="card">
    <h1>Easy there - too many demo workspaces</h1>
    <p>You've spun up a lot of fresh demo war rooms in a short window. This is a soft limit that keeps
       the public demo healthy during judging; your data and the rest of the app are unaffected.</p>
    <p>Try again in about <span class="mono">${mins} minute${mins === 1 ? '' : 's'}</span>, or
       <a href="/">return to your current workspace</a>.</p>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 429,
    headers: { 'content-type': 'text/html; charset=utf-8', 'retry-after': String(retryAfter) },
  });
}
