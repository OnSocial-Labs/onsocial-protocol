'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

/** Flat OS icon hit target — back, close, discover, wallet slots. */
export const osIconActionClassName = 'glass-sheet-icon-action';

/** @deprecated Use {@link osIconActionClassName}. */
export const sheetIconActionClassName = osIconActionClassName;

export const osIconActionGlyphClassName = 'glass-sheet-icon-action-glyph';

export interface OsIconActionProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  ariaLabel: string;
  children: ReactNode;
}

export function OsIconAction({
  ariaLabel,
  className,
  children,
  type = 'button',
  ...props
}: OsIconActionProps) {
  return (
    <button
      type={type}
      className={cn(osIconActionClassName, className)}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </button>
  );
}
