import { cn } from '@/lib/utils';

/** Outline tabs with a stable box — inactive keeps a transparent border. */
export function governanceSegmentButtonClass(active: boolean) {
  return cn(
    active
      ? 'border-border/60 bg-background font-medium text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]'
      : 'border-transparent bg-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
  );
}

/** DAO board switcher — same stable border; active keeps the blue surface. */
export function governanceBoardButtonClass(active: boolean) {
  return cn(
    active
      ? 'portal-blue-surface font-medium'
      : 'border-transparent bg-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
  );
}
