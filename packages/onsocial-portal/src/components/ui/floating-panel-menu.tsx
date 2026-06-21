'use client';

import { forwardRef, type ReactNode, type WheelEventHandler } from 'react';
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
  offsetClass?: string;
  className?: string;
  role?: string;
  'aria-label'?: string;
  id?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onWheelCapture?: WheelEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export const FloatingPanelMenu = forwardRef<
  HTMLDivElement,
  FloatingPanelMenuProps
>(function FloatingPanelMenu(
  {
    open,
    align = 'right',
    offsetClass = 'mt-2',
    className,
    children,
    ...props
  },
  ref
) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          ref={ref}
          {...scaleFadeMotion(!!reduceMotion, {
            y: 10,
            scale: 0.97,
            duration: 0.26,
            exitY: 8,
            exitScale: 0.985,
          })}
          className={cn(
            'absolute top-full z-40 max-w-[calc(100vw-2rem)] origin-top',
            alignClasses[align],
            offsetClass,
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
});
