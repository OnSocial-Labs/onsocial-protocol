import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { cn } from '@/lib/utils';

export type RelationshipSignalTone = 'blue' | 'purple' | 'gold';

export function RelationshipSignal({
  label,
  tone,
  title,
}: {
  label: string;
  tone: RelationshipSignalTone;
  title: string;
}) {
  return (
    <PortalHoverTooltip
      className="inline-flex items-center gap-1.5 whitespace-nowrap portal-type-micro font-medium uppercase tracking-[0.14em] text-muted-foreground/70"
      aria-label={title}
      stopPropagation
      tooltip={title}
    >
      <span
        aria-hidden="true"
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'blue' && 'bg-[var(--portal-blue)]/80',
          tone === 'purple' && 'bg-[var(--portal-purple)]/80',
          tone === 'gold' && 'bg-[var(--portal-gold)]/80'
        )}
      />
      {label}
    </PortalHoverTooltip>
  );
}
