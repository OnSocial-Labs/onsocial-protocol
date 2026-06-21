import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export const RALLY_SLOT_PULSE_CLASS = 'rounded-full bg-foreground/[0.06]';

/**
 * One reserved line box — skeleton pulse and loaded copy share the same wrapper,
 * height, and vertical alignment (flex + items-center + leading-none).
 */
export function RallyTextSlot({
  lineClass,
  pulseClass = 'h-[1em] w-16 max-w-full',
  loading = false,
  className,
  children,
  ...rest
}: {
  lineClass: string;
  pulseClass?: string;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
} & React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn(lineClass, className)} {...rest}>
      {loading ? (
        <Skeleton
          className={cn(RALLY_SLOT_PULSE_CLASS, 'shrink-0', pulseClass)}
        />
      ) : (
        children
      )}
    </div>
  );
}
