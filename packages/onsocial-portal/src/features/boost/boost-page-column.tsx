import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Shared centered column for Boost page sections (desktop + mobile). */
export const BOOST_PAGE_COLUMN_CLASS = 'mx-auto w-full max-w-xl';

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
