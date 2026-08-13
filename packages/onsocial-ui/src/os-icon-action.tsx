'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
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
  /**
   * Merge chrome onto the single child (Next `Link`, `<a>`, custom nav).
   * Child keeps its own element; className + aria-label are composed.
   */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function OsIconAction({
  ariaLabel,
  className,
  children,
  asChild = false,
  type = 'button',
  ref,
  ...props
}: OsIconActionProps) {
  const mergedClassName = cn(osIconActionClassName, className);

  if (asChild) {
    const child = Children.only(children);
    if (!isValidElement(child)) {
      throw new Error(
        'OsIconAction asChild expects a single React element child.'
      );
    }
    const childEl = child as ReactElement<{
      className?: string;
      'aria-label'?: string;
    }>;
    return cloneElement(childEl, {
      ...props,
      className: cn(mergedClassName, childEl.props.className),
      'aria-label': childEl.props['aria-label'] ?? ariaLabel,
    });
  }

  return (
    <button
      ref={ref}
      type={type}
      className={mergedClassName}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </button>
  );
}
