'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  cn,
  OsSheetActions,
  osSheetActionClassName,
} from '@onsocial/ui';

export const osRowActionClassName = 'os-row-action';

/**
 * Inline row / header chip (Play, Watch, View drop, See all).
 * Same borderless `sm` sheet action as Market Buy and `OsEmptyAction`.
 * Do not hand-roll `page-drawer-section-action`.
 */
export function OsRowAction({
  href,
  onClick,
  className,
  'aria-label': ariaLabel,
  children,
}: {
  href?: string;
  onClick?: () => void;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  const actionClassName = cn(
    osSheetActionClassName,
    'os-sheet-action--primary',
    'is-ready'
  );
  const label = (
    <span className="os-sheet-action__shell">
      <span className="os-sheet-action__label">{children}</span>
    </span>
  );

  return (
    <OsSheetActions
      className={cn(osRowActionClassName, className)}
      layout="row-compact"
      tone="frosted-primary"
      size="sm"
      borderless
    >
      {href ? (
        <Link
          href={href}
          scroll={false}
          className={actionClassName}
          aria-label={ariaLabel}
        >
          {label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className={actionClassName}
          aria-label={ariaLabel}
        >
          {label}
        </button>
      )}
    </OsSheetActions>
  );
}
