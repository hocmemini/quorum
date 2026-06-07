import { DsqlSigner } from '@aws-sdk/dsql-signer';

export type TokenProvider = () => Promise<string>;

export interface TokenOptions {
  /** Seconds a cached token is reused before refresh (kept under the token's own TTL). */
  ttlSeconds?: number;
  /** Token validity requested from the signer, in seconds. */
  expiresInSeconds?: number;
  /** Database role; `admin` uses the admin token, anything else the standard token. */
  user?: string;
}

/**
 * TTL-cached DSQL IAM auth-token provider for one host/region (admin role by default).
 * pg calls this `password` function on every new physical connection; the cache avoids
 * re-signing each connect while refreshing before the token expires.
 */
export function createTokenProvider(
  host: string,
  region: string,
  opts: TokenOptions = {},
): TokenProvider {
  const ttlMs = (opts.ttlSeconds ?? 840) * 1000;
  const signer = new DsqlSigner({
    hostname: host,
    region,
    expiresIn: opts.expiresInSeconds ?? 900,
  });
  const isAdmin = (opts.user ?? 'admin') === 'admin';
  const produce = (): Promise<string> =>
    isAdmin ? signer.getDbConnectAdminAuthToken() : signer.getDbConnectAuthToken();

  let cache: { token: string; expiresAt: number } | undefined;
  return async () => {
    const now = Date.now();
    if (cache && now < cache.expiresAt) return cache.token;
    const token = await produce();
    cache = { token, expiresAt: now + ttlMs };
    return token;
  };
}
