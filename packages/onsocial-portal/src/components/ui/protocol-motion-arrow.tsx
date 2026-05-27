import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProtocolMotionArrowDirection = 'up' | 'down' | 'in' | 'left';

interface ProtocolMotionArrowProps {
  direction?: ProtocolMotionArrowDirection;
  className?: string;
  /**
   * When true, the arrow renders at full opacity with no hover animation.
   * Use in informational contexts (e.g. non-clickable metric strips) where the
   * arrow is a static glyph rather than an affordance.
   */
  static?: boolean;
}

export function ProtocolMotionArrow({
  direction = 'up',
  className,
  static: isStatic = false,
}: ProtocolMotionArrowProps) {
  const Icon = direction === 'left' ? ArrowLeft : ArrowUpRight;

  return (
    <Icon
      aria-hidden="true"
      className={cn(
        'shrink-0 motion-reduce:transform-none',
        isStatic
          ? 'opacity-80'
          : 'opacity-40 transition-all duration-200 group-hover:opacity-100',
        direction === 'down'
          ? cn(
              'rotate-90',
              !isStatic &&
                'group-hover:translate-x-0.5 group-hover:translate-y-0.5'
            )
          : direction === 'in'
            ? cn(
                'rotate-180',
                !isStatic &&
                  'group-hover:-translate-x-0.5 group-hover:translate-y-0.5'
              )
            : direction === 'left'
              ? cn(!isStatic && 'group-hover:-translate-x-0.5')
              : cn(
                  !isStatic &&
                    'group-hover:translate-x-0.5 group-hover:-translate-y-0.5'
                ),
        className
      )}
    />
  );
}
