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
  // Defaults sized for shared judge IPs (DEC-028): a NAT/VPN group never trips the per-IP cap, and a
  // generous global ceiling is the real abuse/cost stop. Set the global to "off" or "0" to disable it.
  const rawGlobal = process.env.RATE_LIMIT_GLOBAL_PER_MINUTE ?? '60';
  return {
    windowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 600),
    maxPerIp: Number(process.env.RATE_LIMIT_MAX_PER_IP ?? 100),
    globalPerMinute: rawGlobal === 'off' || rawGlobal === '0' ? null : Number(rawGlobal),
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
