'use client';

import Link from 'next/link';
import {
  cn,
  OsSheetActions,
  osSheetActionClassName,
} from '@onsocial/ui';

export const osEmptyActionClassName = 'os-empty-action';

/**
 * Page-empty and list-retry recovery CTA. Inset actions share
 * `.os-app-chrome-page`; recoveries share this borderless `sm` sheet
 * action. Do not hand-roll underlined text links or bordered pills
 * on an empty.
 */
export function OsEmptyAction({
  href,
  onClick,
  className,
  children,
}: {
  href?: string;
  onClick?: () => void;
  className?: string;
  children: string;
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
      className={cn(osEmptyActionClassName, className)}
      layout="row-compact"
      tone="frosted-primary"
      size="sm"
      borderless
    >
      {href ? (
        <Link href={href} scroll={false} className={actionClassName}>
          {label}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={actionClassName}>
          {label}
        </button>
      )}
    </OsSheetActions>
  );
}
