import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function BoostPanelSectionTitle({
  children,
  align = 'start',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <p
      className={cn(
        'portal-eyebrow-wide text-muted-foreground',
        align === 'center' && 'text-center',
        className
      )}
    >
      {children}
    </p>
  );
}
