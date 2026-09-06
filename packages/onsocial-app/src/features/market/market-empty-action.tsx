'use client';

import Link from 'next/link';
import {
  cn,
  OsSheetActions,
  osSheetActionClassName,
} from '@onsocial/ui';

/** Empty-state CTA — same borderless Market pill as Mint / Open. */
export function MarketEmptyAction({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <OsSheetActions
      layout="row-compact"
      tone="frosted-primary"
      size="sm"
      borderless
    >
      <Link
        href={href}
        scroll={false}
        className={cn(
          osSheetActionClassName,
          'os-sheet-action--primary',
          'is-ready'
        )}
      >
        <span className="os-sheet-action__shell">
          <span className="os-sheet-action__label">{children}</span>
        </span>
      </Link>
    </OsSheetActions>
  );
}
