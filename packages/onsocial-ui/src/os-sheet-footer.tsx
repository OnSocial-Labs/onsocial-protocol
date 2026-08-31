'use client';

import type { ReactNode } from 'react';
import { cn } from './cn.js';

export const osSheetFooterClassName = 'os-sheet-footer';

/**
 * Shared GlassSheet CTA footer — resting inset from `--os-sheet-footer-*`.
 * Set `keyboardOpen` on amount/commerce sheets so bottom safe-area trims while lifted.
 */
export function OsSheetFooter({
  children,
  className,
  keyboardOpen = false,
}: {
  children: ReactNode;
  className?: string;
  keyboardOpen?: boolean;
}) {
  return (
    <div
      className={cn(
        osSheetFooterClassName,
        keyboardOpen && 'is-keyboard-open',
        className
      )}
    >
      {children}
    </div>
  );
}
