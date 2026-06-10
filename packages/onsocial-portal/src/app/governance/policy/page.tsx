'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { RouteLoadingShell } from '@/components/layout/route-loading-shell';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { GovernancePolicyPanel } from '@/features/governance/governance-policy-panel';
import {
  GOVERNANCE_DAO_BOARD_PARAM,
  parseGovernanceDaoBoard,
  resolveGovernanceDaoAccountId,
} from '@/features/governance/governance-dao-board';

function GovernancePolicyPageContent() {
  const searchParams = useSearchParams();
  const { setNavBack } = useMobilePageContext();
  const daoAccountId = resolveGovernanceDaoAccountId(
    parseGovernanceDaoBoard(searchParams.get(GOVERNANCE_DAO_BOARD_PARAM))
  );

  useEffect(() => {
    setNavBack({ label: 'Back' });
    return () => setNavBack(null);
  }, [setNavBack]);

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Governance"
        badgeAccent="blue"
        className="mb-4 py-1 md:mb-5 md:py-2"
      />
      <GovernancePolicyPanel daoAccountId={daoAccountId} />
    </PageShell>
  );
}

export default function GovernancePolicyPage() {
  return (
    <Suspense
      fallback={
        <RouteLoadingShell
          size="form"
          panelCount={1}
          panelMinHeights={['18rem']}
        />
      }
    >
      <GovernancePolicyPageContent />
    </Suspense>
  );
}
