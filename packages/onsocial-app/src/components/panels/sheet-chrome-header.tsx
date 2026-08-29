'use client';

import type { ReactNode } from 'react';
import { SheetCloseButton } from '@onsocial/ui';

interface SheetChromeHeaderProps {
  /** Leading content — subject block, search field, or copy. Omit for toolbar-only chrome. */
  children?: ReactNode;
  /** Trailing actions rendered before the close button. */
  actions?: ReactNode;
  onClose?: () => void;
  closeAriaLabel?: string;
  /** Content under the main row (chip rails, tabs, filters). */
  toolbar?: ReactNode;
  className?: string;
  /** Overrides the main row recipe (default `.standing-sheet-subject-row`). */
  rowClassName?: string;
  actionsClassName?: string;
  /** `undefined` = `.standing-sheet-toolbar-row`; `null` = no wrapper. */
  toolbarClassName?: string | null;
}

/**
 * One chrome recipe for sheet headers — leading content, trailing actions /
 * close, optional toolbar row. Replaces hand-rolled `.standing-sheet-header`
 * markup. Title-centric sheets use `SheetHeader` from @onsocial/ui instead.
 */
export function SheetChromeHeader({
  children,
  actions,
  onClose,
  closeAriaLabel = 'Close',
  toolbar,
  className,
  rowClassName,
  actionsClassName,
  toolbarClassName,
}: SheetChromeHeaderProps) {
  const showRow = Boolean(children) || Boolean(actions) || Boolean(onClose);

  return (
    <header
      className={`standing-sheet-header${className ? ` ${className}` : ''}`}
    >
      {showRow ? (
        <div className={rowClassName ?? 'standing-sheet-subject-row'}>
          {children}
          {actions || onClose ? (
            <div
              className={`standing-sheet-actions${
                actionsClassName ? ` ${actionsClassName}` : ''
              }`}
            >
              {actions}
              {onClose ? (
                <SheetCloseButton onClick={onClose} ariaLabel={closeAriaLabel} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {toolbar != null ? (
        toolbarClassName === null ? (
          toolbar
        ) : (
          <div className={toolbarClassName ?? 'standing-sheet-toolbar-row'}>
            {toolbar}
          </div>
        )
      ) : null}
    </header>
  );
}
