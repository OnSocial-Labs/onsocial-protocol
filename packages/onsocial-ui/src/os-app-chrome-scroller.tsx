'use client';

import type { HTMLAttributes, ReactNode, Ref } from 'react';

export const osAppChromeScrollerBleedClassName = 'os-app-chrome-scroller-bleed';
export const osAppChromeScrollerClassName = 'os-app-chrome-scroller';
export const osAppChromeScrollerInsetClassName = 'os-app-chrome-scroller-inset';

/**
 * Nested scroll under glass chrome — edge scrollbar, inset content, frost bleed.
 * Pass `scrollRef` to the overflow pane (elevation / infinite scroll hooks).
 */
export function OsAppChromeScroller({
  children,
  className = '',
  scrollRef,
  insetClassName = '',
  bleedClassName = '',
  ...scrollProps
}: {
  children: ReactNode;
  className?: string;
  scrollRef?: Ref<HTMLDivElement>;
  insetClassName?: string;
  bleedClassName?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) {
  return (
    <div
      className={`${osAppChromeScrollerBleedClassName}${bleedClassName ? ` ${bleedClassName}` : ''}`}
    >
      <div
        ref={scrollRef}
        className={`${osAppChromeScrollerClassName}${className ? ` ${className}` : ''}`}
        {...scrollProps}
      >
        <div
          className={`${osAppChromeScrollerInsetClassName}${insetClassName ? ` ${insetClassName}` : ''}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
