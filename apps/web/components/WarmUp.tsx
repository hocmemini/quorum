'use client';

import { useEffect } from 'react';

// Pre-warm on tenant entry (DEC-020): warm both region pools on the instance the session landed on
// so the cold connection cost is paid during render, not on the judge's first deliberate click.
// No UI; fires once on mount. The dsql-monitor keeps a baseline instance warm on its schedule.
export function WarmUp() {
  useEffect(() => {
    fetch('/api/keepalive').catch(() => {});
  }, []);
  return null;
}
