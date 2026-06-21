import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared centered column for season rally pages (desktop + mobile). */
export const SEASON_PAGE_COLUMN_CLASS = 'mx-auto w-full max-w-xl';

export const SEASON_PANEL_PADDING_CLASS = 'p-3.5 md:p-4';

export const SEASON_PANEL_DIVIDER_CLASS =
  'mt-3 border-t border-fade-detail pt-3';

/** Metrics rail value row — stable height on load/refresh. */
export const SEASON_PULSE_VALUE_ROW_CLASS =
  'mt-0.5 flex min-h-5 items-center justify-center';

/** Join footer — status line + CTA row. */
export const SEASON_RALLY_FOOTER_MIN_CLASS = 'min-h-[4.5rem]';

/** Collect block — eyebrow, amount, context, CTA. */
export const SEASON_COLLECT_SECTION_MIN_CLASS =
  'min-h-[10.25rem] sm:min-h-[10.75rem]';

export const SEASON_COLLECT_AMOUNT_ROW_CLASS = 'min-h-9 sm:min-h-10';
export const SEASON_COLLECT_ACTION_ROW_CLASS = 'min-h-9';

export function SeasonPageColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        SEASON_PAGE_COLUMN_CLASS,
        'space-y-3 md:space-y-4',
        className
      )}
    >
      {children}
    </div>
  );
}
