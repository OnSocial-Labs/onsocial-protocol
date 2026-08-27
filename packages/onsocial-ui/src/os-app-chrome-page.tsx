'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export const osAppChromePageClassName = 'os-app-chrome-page';
export const osAppChromePageStatusClassName = 'os-app-chrome-page-status';

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
}: {
  className?: string;
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      className={cn(
        osAppChromePageStatusClassName,
        error && 'is-error',
        className
      )}
    >
      {children}
    </p>
  );
}
