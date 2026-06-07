import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { PanelSkeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';

export default function GovernanceCreateLoading() {
  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Governance"
        badgeAccent="blue"
        className="mb-4 py-1 md:mb-5 md:py-2"
      />
      <SurfacePanel tone="soft" className="mb-6 p-4 md:p-6">
        <PanelSkeleton minHeight="14rem" detailLines={3} statBlocks={3} />
      </SurfacePanel>
    </PageShell>
  );
}
