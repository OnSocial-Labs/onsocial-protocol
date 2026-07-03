'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export const osSurfaceHaloClassName = 'os-surface-halo';
export const osSurfaceHaloStandardClassName = 'os-surface-halo--standard';

export type OsSurfaceHaloTone = 'default' | 'standard' | 'danger';

export interface OsSurfaceHaloProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  tone?: OsSurfaceHaloTone;
}

export function OsSurfaceHalo({
  children,
  className,
  tone = 'default',
  ...props
}: OsSurfaceHaloProps) {
  return (
    <div
      className={cn(
        osSurfaceHaloClassName,
        tone === 'standard' && osSurfaceHaloStandardClassName,
        tone === 'danger' && 'os-surface-halo--danger',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
