import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Height + opacity morph — scroll latch prevents ping-pong feedback loops. */
export function GovernanceRailCollapseSection({
  collapsed,
  children,
  className,
  animate = true,
}: {
  collapsed: boolean;
  children: ReactNode;
  className?: string;
  animate?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid',
        collapsed
          ? 'pointer-events-none grid-rows-[0fr] opacity-0'
          : 'grid-rows-[1fr] opacity-100',
        animate &&
          'transition-[grid-template-rows,opacity] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        className
      )}
      aria-hidden={collapsed}
    >
      <div
        className={cn(
          'min-h-0',
          collapsed ? 'overflow-hidden' : 'overflow-visible'
        )}
      >
        {children}
      </div>
    </div>
  );
}
