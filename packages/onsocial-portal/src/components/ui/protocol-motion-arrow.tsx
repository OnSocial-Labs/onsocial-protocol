import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProtocolMotionArrowDirection = 'up' | 'down' | 'in' | 'left';

interface ProtocolMotionArrowProps {
  direction?: ProtocolMotionArrowDirection;
  className?: string;
}

export function ProtocolMotionArrow({
  direction = 'up',
  className,
}: ProtocolMotionArrowProps) {
  const Icon = direction === 'left' ? ArrowLeft : ArrowUpRight;

  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'shrink-0 opacity-40 transition-all duration-200 group-hover:opacity-100 motion-reduce:transform-none',
        direction === 'down'
          ? 'rotate-90 group-hover:translate-x-0.5 group-hover:translate-y-0.5'
          : direction === 'in'
            ? 'rotate-180 group-hover:-translate-x-0.5 group-hover:translate-y-0.5'
            : direction === 'left'
              ? 'group-hover:-translate-x-0.5'
              : 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5',
        className
      )}
    />
  );
}
