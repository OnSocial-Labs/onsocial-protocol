import { cn } from '@/lib/utils';

/** Button height + soft shadow bleed — keeps page layout stable on load. */
export const SEASON_ARCHIVE_NAV_SLOT_CLASS =
  'min-h-[2.75rem] pb-1';

export const SEASON_ARCHIVE_NAV_BUTTON_SHELL_CLASS =
  'flex h-8 items-center gap-1.5 rounded-full border border-border/40 bg-background/65 px-3 text-xs text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md';

/** Reserved collect-hint dot slot — width stays even while hint loads. */
export const SEASON_ARCHIVE_COLLECT_DOT_SLOT_CLASS =
  'flex h-1.5 w-1.5 shrink-0 items-center justify-center';

export function SeasonArchiveCollectDot({
  visible = false,
  className,
}: {
  visible?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(SEASON_ARCHIVE_COLLECT_DOT_SLOT_CLASS, className)}
      aria-hidden
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full bg-[var(--portal-gold)] shadow-[0_0_6px_var(--portal-gold-glow)] transition-opacity duration-200',
          visible ? 'opacity-100' : 'opacity-0'
        )}
      />
    </span>
  );
}

export function SeasonArchiveNavSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-2',
        SEASON_ARCHIVE_NAV_SLOT_CLASS,
        className
      )}
      aria-hidden
    >
      <div className={SEASON_ARCHIVE_NAV_BUTTON_SHELL_CLASS}>
        <span className="h-3 w-[4.5rem] animate-pulse rounded-full bg-foreground/[0.04]" />
        <SeasonArchiveCollectDot />
        <span className="h-3.5 w-3.5 shrink-0 animate-pulse rounded-sm bg-foreground/[0.04]" />
      </div>
    </div>
  );
}
