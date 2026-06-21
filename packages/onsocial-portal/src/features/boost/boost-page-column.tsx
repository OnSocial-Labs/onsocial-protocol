import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared centered column for Boost page sections (desktop + mobile). */
export const BOOST_PAGE_COLUMN_CLASS = 'mx-auto w-full max-w-xl';

/** Panel padding — keep Commit + Commitment panels aligned. */
export const BOOST_PANEL_PADDING_CLASS = 'p-3.5 md:p-4';

/** Internal section divider inside a panel. */
export const BOOST_PANEL_DIVIDER_CLASS =
  'mt-3 border-t border-fade-detail pt-3';

/** Collect block min-height — eyebrow, amount, rate, CTA (anti-jump, not extra air). */
export const BOOST_COLLECT_SECTION_MIN_CLASS =
  'min-h-[10.25rem] sm:min-h-[10.75rem]';

export const BOOST_COLLECT_AMOUNT_ROW_CLASS = 'min-h-9 sm:min-h-10';
export const BOOST_COLLECT_RATE_ROW_CLASS = 'min-h-4';
export const BOOST_COLLECT_ACTION_ROW_CLASS = 'min-h-9';

export function BoostPageColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        BOOST_PAGE_COLUMN_CLASS,
        'space-y-3 md:space-y-4',
        className
      )}
    >
      {children}
    </div>
  );
}
