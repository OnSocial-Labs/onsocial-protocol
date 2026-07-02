'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.js';

export const osSurfaceHaloClassName = 'os-surface-halo';

export type OsSurfaceHaloTone = 'default' | 'danger';

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
        tone === 'danger' && 'os-surface-halo--danger',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
