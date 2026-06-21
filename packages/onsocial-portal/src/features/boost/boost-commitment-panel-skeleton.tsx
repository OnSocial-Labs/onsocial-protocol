import { SurfacePanel } from '@/components/ui/surface-panel';
import {
  BOOST_PANEL_PADDING_CLASS,
} from '@/features/boost/boost-page-column';
import { BoostCommitmentSummarySkeleton } from '@/features/boost/boost-commitment-summary';
import { cn } from '@/lib/utils';

export function BoostCommitmentPanelSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <SurfacePanel
      radius="xl"
      tone="soft"
      className={cn('h-full min-h-[12rem]', BOOST_PANEL_PADDING_CLASS, className)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="h-4 w-24 animate-pulse rounded-full bg-foreground/[0.08]" />
        <div className="h-6 w-16 animate-pulse rounded-full bg-foreground/[0.06]" />
      </div>
      <BoostCommitmentSummarySkeleton />
    </SurfacePanel>
  );
}
