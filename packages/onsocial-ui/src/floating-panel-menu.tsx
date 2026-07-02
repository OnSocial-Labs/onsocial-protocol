'use client';

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn.js';
import {
  osFloatingPanelClassName,
  osFloatingPanelMenuAlignClassName,
  osFloatingPanelMenuClassName,
  osFloatingPanelMenuOffsetClassName,
  type OsFloatingPanelMenuAlign,
  type OsFloatingPanelMenuOffset,
} from './floating-panel.js';

export interface FloatingPanelMenuProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  align?: OsFloatingPanelMenuAlign;
  offset?: OsFloatingPanelMenuOffset;
  children?: ReactNode;
}

export const FloatingPanelMenu = forwardRef<
  HTMLDivElement,
  FloatingPanelMenuProps
>(function FloatingPanelMenu(
  { open, align = 'left', offset = 'sm', className, children, ...props },
  ref
) {
  if (!open) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn(
        osFloatingPanelMenuClassName,
        osFloatingPanelMenuAlignClassName(align),
        osFloatingPanelMenuOffsetClassName(offset),
        osFloatingPanelClassName,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
