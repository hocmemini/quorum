'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Near-real-time war room (DEC-016): re-render the server component on a short interval, so a
 *  second screen updates on its own. The baseline before SSE. */
export function AutoRefresh({ intervalMs = 2500 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}
