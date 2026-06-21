'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import GovernanceManageLoading from './loading';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { GovernancePositionPanel } from '@/features/governance/governance-position-panel';
import {
  GOVERNANCE_DAO_BOARD_PARAM,
  parseGovernanceDaoBoard,
  resolveGovernanceDaoAccountId,
} from '@/features/governance/governance-dao-board';

function GovernanceManagePageContent() {
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

      <GovernancePositionPanel daoAccountId={daoAccountId} />
    </PageShell>
  );
}

export default function GovernanceManagePage() {
  return (
    <Suspense fallback={<GovernanceManageLoading />}>
      <GovernanceManagePageContent />
    </Suspense>
  );
}
