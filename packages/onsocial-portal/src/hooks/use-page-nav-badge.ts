'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import type { PortalAccent } from '@/lib/portal-colors';
import {
  resolveNavBadgeLabel,
  truncateNavBadgeLabel,
} from '@/lib/nav-badge-label';

/** Show a section badge in the mobile navbar center (desktop context menu). */
export function usePageNavBadge(
  badge: ReactNode,
  badgeAccent: PortalAccent
): void {
  const badgeKey = useId();
  const { setPageBadge, clearPageBadge } = useMobilePageContext();
  const resolved = resolveNavBadgeLabel(badge);
  const badgeLabel =
    typeof resolved === 'string' ? truncateNavBadgeLabel(resolved) : resolved;

  useEffect(() => {
    setPageBadge({
      key: badgeKey,
      badge: badgeLabel,
      badgeAccent,
    });
    return () => clearPageBadge(badgeKey);
  }, [badgeAccent, badgeKey, badgeLabel, clearPageBadge, setPageBadge]);
}
