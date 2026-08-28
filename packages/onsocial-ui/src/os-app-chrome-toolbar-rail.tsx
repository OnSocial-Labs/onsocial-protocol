'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

/** Scroll-tuck toolbar row under compact glass chrome (one line). */
export const osAppChromeRailClassName = 'os-app-chrome-rail';

/**
 * Single-line toolbar rail — pairs with app `OsAppScreen` `toolbar` slot.
 * For heading+chip screens use `scrollTuck="search"` on the screen (chips stay).
 * Pass `hidden` only for toolbar-only tuck.
 */
export function OsAppChromeToolbarRail({
  hidden = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        osAppChromeRailClassName,
        hidden && 'is-scroll-hidden',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
