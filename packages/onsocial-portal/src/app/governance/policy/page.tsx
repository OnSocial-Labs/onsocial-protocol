'use client';

import { useEffect } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { useMobilePageContext } from '@/components/providers/mobile-page-context';
import { GovernancePolicyPanel } from '@/features/governance/governance-policy-panel';

export default function GovernancePolicyPage() {
  const { setNavBack } = useMobilePageContext();

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
      <GovernancePolicyPanel />
    </PageShell>
  );
}
