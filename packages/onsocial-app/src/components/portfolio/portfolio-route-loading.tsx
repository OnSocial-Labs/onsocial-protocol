'use client';

import { useParams } from 'next/navigation';
import { PortfolioShellPending } from '@/components/portfolio/portfolio-shell';

/**
 * Cold `/[accountId]` shell. `loading.tsx` has no params — read the segment.
 */
export function PortfolioRouteLoading() {
  const params = useParams<{ accountId?: string }>();
  const accountId =
    typeof params?.accountId === 'string' ? params.accountId : '';
  return <PortfolioShellPending pageAccountId={accountId} />;
}
