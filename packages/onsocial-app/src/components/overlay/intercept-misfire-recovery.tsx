'use client';

import { useEffect } from 'react';

/**
 * Route-group intercept misfire recovery.
 *
 * Route groups don't appear in URLs, so `/home` (app route) and `/@alice`
 * (account route) share the same depth. Next.js interception fires on URL
 * shape, so a soft nav from an app route to an intercepted panel renders the
 * `[accountId]` branch with the app segment (e.g. "home") as `accountId`.
 * The browser URL is already the correct target — hard-load it so the full
 * page renders instead of the overlay slot.
 */
export function InterceptMisfireRecovery() {
  useEffect(() => {
    window.location.reload();
  }, []);

  return null;
}
