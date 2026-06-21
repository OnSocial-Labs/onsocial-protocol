import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const TRANSPARENCY_PAGE_COLUMN_CLASS = 'mx-auto w-full max-w-xl';

export const TRANSPARENCY_PANEL_PADDING_CLASS = 'p-3.5 md:p-4';

export const TRANSPARENCY_PANEL_DIVIDER_CLASS =
  'mt-3 border-t border-fade-detail pt-3';

export const TRANSPARENCY_PULSE_CONTAINER_CLASS = 'min-h-0';

/** Stats block — supply hero + 3-up row. */
export const TRANSPARENCY_PULSE_STATS_CLASS =
  'mt-2.5 min-h-[5.75rem] border-t border-fade-detail pt-2.5';

export const TRANSPARENCY_PULSE_VALUE_ROW_CLASS =
  'mt-0.5 flex min-h-5 items-center justify-center';

export const TRANSPARENCY_PULSE_SUPPLY_VALUE_ROW_CLASS =
  'mt-0.5 flex min-h-6 items-center justify-center';

export function TransparencyPageColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        TRANSPARENCY_PAGE_COLUMN_CLASS,
        'space-y-3 md:space-y-4',
        className
      )}
    >
      {children}
    </div>
  );
}
