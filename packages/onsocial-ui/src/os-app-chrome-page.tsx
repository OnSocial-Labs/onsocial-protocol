'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';
import {
  osAppChromePageClassName,
  osAppChromePageStatusClassName,
} from './os-app-chrome-page-class-names.js';

export {
  osAppChromePageClassName,
  osAppChromePageStatusClassName,
} from './os-app-chrome-page-class-names.js';

/** Standard OsAppScreen page root — `--os-screen-body-inset`, same width as Home. */
export function OsAppChromePage({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(osAppChromePageClassName, className)} {...props}>
      {children}
    </div>
  );
}

/** Loading / empty / hint line below the chrome band (not under it). */
export function OsAppChromePageStatus({
  className,
  children,
  error = false,
  ...props
}: {
  className?: string;
  children: ReactNode;
  error?: boolean;
} & Omit<HTMLAttributes<HTMLParagraphElement>, 'className' | 'children'>) {
  return (
    <p
      className={cn(
        osAppChromePageStatusClassName,
        error && 'is-error',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
}
