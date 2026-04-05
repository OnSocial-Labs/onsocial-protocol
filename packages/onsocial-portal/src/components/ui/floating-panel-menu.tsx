'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { floatingPanelClass } from '@/components/ui/floating-panel';
import { scaleFadeMotion } from '@/lib/motion';
import { cn } from '@/lib/utils';

const alignClasses = {
  left: 'left-0',
  right: 'right-0',
  center: 'left-1/2 -translate-x-1/2',
  full: 'left-0 right-0',
} as const;

interface FloatingPanelMenuProps {
  open: boolean;
  align?: keyof typeof alignClasses;
  className?: string;
  role?: string;
  'aria-label'?: string;
  id?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function FloatingPanelMenu({
  open,
  align = 'right',
  className,
  children,
  ...props
}: FloatingPanelMenuProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          {...scaleFadeMotion(!!reduceMotion, {
            y: 10,
            scale: 0.97,
            duration: 0.26,
            exitY: 8,
            exitScale: 0.985,
          })}
          className={cn(
            'absolute z-40 mt-2 max-w-[calc(100vw-2rem)] origin-top overflow-hidden',
            alignClasses[align],
            floatingPanelClass,
            className
          )}
          {...props}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
