'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { Button, buttonArrowLeftClass } from '@/components/ui/button';
import { GovernancePositionPanel } from '@/features/governance/governance-position-panel';

export default function GovernanceManagePage() {
  const router = useRouter();

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Governance"
        badgeAccent="blue"
        glowAccents={['blue', 'green']}
        contentClassName="max-w-3xl"
        title="Account controls"
        description="Manage your DAO delegations and withdrawals."
      >
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => router.back()}
        >
          <ArrowLeft className={`h-4 w-4 ${buttonArrowLeftClass}`} />
          Back
        </Button>
      </SecondaryPageHeader>

      <GovernancePositionPanel />
    </PageShell>
  );
}
