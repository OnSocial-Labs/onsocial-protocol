import { SEASON_PANEL_PADDING_CLASS } from '@/features/season/season-page-column';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import { cn } from '@/lib/utils';

/** Connect wallet prompt placeholder — post-live, wallet not connected. */
export function RallyConnectFooterSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn(SEASON_PANEL_PADDING_CLASS, 'py-2.5', className)}>
      <div className="flex min-h-[4.5rem] flex-col items-center justify-center gap-2">
        <RallyTextSlot
          lineClass="flex min-h-4 w-full max-w-[16rem] items-center justify-center leading-none"
          loading
          pulseClass="h-[1em] w-full"
        />
        <RallyTextSlot
          lineClass="flex h-9 w-[8.5rem] items-center justify-center leading-none"
          loading
          pulseClass="h-[1em] w-full rounded-full"
        />
      </div>
    </div>
  );
}
