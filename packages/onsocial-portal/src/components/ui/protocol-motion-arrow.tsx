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
  /**
   * When true, render the arrow in its expanded/hover pose — full opacity and
   * directional offset. Use for active flows (e.g. a live swap quote).
   */
  expanded?: boolean;
}

export function ProtocolMotionArrow({
  direction = 'up',
  className,
  static: isStatic = false,
  expanded = false,
}: ProtocolMotionArrowProps) {
  const Icon = direction === 'left' ? ArrowLeft : ArrowUpRight;
  const motionEnabled = !isStatic;

  return (
    <Icon
      aria-hidden="true"
      // Heavier stroke + miter join keep the ↗ tip readable at small sizes.
      strokeWidth={2.5}
      strokeLinejoin="miter"
      className={cn(
        'shrink-0 motion-reduce:transform-none',
        motionEnabled && 'transition-all duration-200 group-hover:opacity-100',
        motionEnabled && (expanded ? 'opacity-100' : 'opacity-40'),
        direction === 'down'
          ? cn(
              'rotate-90',
              motionEnabled &&
                (expanded
                  ? 'translate-x-0.5 translate-y-0.5'
                  : 'group-hover:translate-x-0.5 group-hover:translate-y-0.5')
            )
          : direction === 'in'
            ? cn(
                'rotate-180',
                motionEnabled &&
                  (expanded
                    ? '-translate-x-0.5 translate-y-0.5'
                    : 'group-hover:-translate-x-0.5 group-hover:translate-y-0.5')
              )
            : direction === 'left'
              ? cn(
                  motionEnabled &&
                    (expanded
                      ? '-translate-x-0.5'
                      : 'group-hover:-translate-x-0.5')
                )
              : cn(
                  motionEnabled &&
                    (expanded
                      ? 'translate-x-0.5 -translate-y-0.5'
                      : 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5')
                ),
        className
      )}
    />
  );
}
