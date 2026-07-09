'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
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
  ref?: Ref<HTMLButtonElement>;
}

export function OsIconAction({
  ariaLabel,
  className,
  children,
  type = 'button',
  ref,
  ...props
}: OsIconActionProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(osIconActionClassName, className)}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </button>
  );
}
