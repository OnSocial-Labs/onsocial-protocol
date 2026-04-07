'use client';

import { useEffect } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { GovernancePositionPanel } from '@/features/governance/governance-position-panel';

export default function GovernanceManagePage() {
  const { setNavBack } = useMobilePageContext();

  useEffect(() => {
    setNavBack({ label: 'Back' });
    return () => setNavBack(null);
  }, [setNavBack]);

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Account"
        badgeAccent="blue"
      />

      <GovernancePositionPanel />
    </PageShell>
  );
}
