'use client';

import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { osChoiceSheetFooterClassName } from './os-choice-tokens.js';

export { osChoiceSheetFooterClassName } from './os-choice-tokens.js';

/**
 * Frosted primary CTA band for choice / info / create hug sheets.
 * Pair with GlassSheet `footer` + `chrome="choice"` (body trims when footer is set).
 */
export function OsChoiceSheetFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(osChoiceSheetFooterClassName, className)}>
      {children}
    </div>
  );
}
