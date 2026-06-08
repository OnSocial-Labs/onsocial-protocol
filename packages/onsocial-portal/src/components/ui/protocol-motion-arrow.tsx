import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type ProtocolMotionArrowDirection = 'up' | 'down' | 'in' | 'left';

interface ProtocolMotionArrowProps {
  direction?: ProtocolMotionArrowDirection;
  className?: string;
  /**
   * Tailwind named group for hover (e.g. "card" uses group-hover/card).
   * Omit for the default unnamed `group` / `group-hover` pair.
   */
  groupName?: 'card';
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
  /**
   * Dim the arrow when a nested link or button inside the group is hovered
   * (e.g. clickable governance cards with in-card actions).
   */
  resetOnNestedInteractiveHover?: boolean;
}

const CARD_HOVER_OPACITY = 'group-hover/card:opacity-100';
// Exclude the full-card nav overlay — it is always hovered on card hover.
const CARD_NESTED_RESET_OPACITY = [
  'group-has-[a:hover:not(.governance-card-nav-link)]/card:opacity-40',
  'group-has-[button:hover]/card:opacity-40',
];
const CARD_NESTED_RESET_TRANSLATE = [
  'group-has-[a:hover:not(.governance-card-nav-link)]/card:translate-x-0',
  'group-has-[a:hover:not(.governance-card-nav-link)]/card:translate-y-0',
  'group-has-[button:hover]/card:translate-x-0',
  'group-has-[button:hover]/card:translate-y-0',
];

function motionClasses({
  direction,
  groupName,
  motionEnabled,
  expanded,
  resetOnNestedInteractiveHover,
}: {
  direction: ProtocolMotionArrowDirection;
  groupName?: 'card';
  motionEnabled: boolean;
  expanded: boolean;
  resetOnNestedInteractiveHover: boolean;
}): string[] {
  if (!motionEnabled) {
    return [];
  }

  if (groupName === 'card') {
    const nestedOpacity = resetOnNestedInteractiveHover
      ? CARD_NESTED_RESET_OPACITY
      : [];
    const nestedTranslate = resetOnNestedInteractiveHover
      ? CARD_NESTED_RESET_TRANSLATE
      : [];

    if (expanded) {
      if (direction === 'down') {
        return ['opacity-100', 'translate-x-0.5', 'translate-y-0.5'];
      }
      if (direction === 'in') {
        return ['opacity-100', '-translate-x-0.5', 'translate-y-0.5'];
      }
      if (direction === 'left') {
        return ['opacity-100', '-translate-x-0.5'];
      }
      return ['opacity-100', 'translate-x-0.5', '-translate-y-0.5'];
    }

    if (direction === 'down') {
      return [
        'opacity-40',
        CARD_HOVER_OPACITY,
        'group-hover/card:translate-x-0.5',
        'group-hover/card:translate-y-0.5',
        ...nestedOpacity,
        ...nestedTranslate,
      ];
    }
    if (direction === 'in') {
      return [
        'opacity-40',
        CARD_HOVER_OPACITY,
        'group-hover/card:-translate-x-0.5',
        'group-hover/card:translate-y-0.5',
        ...nestedOpacity,
        ...nestedTranslate,
      ];
    }
    if (direction === 'left') {
      return [
        'opacity-40',
        CARD_HOVER_OPACITY,
        'group-hover/card:-translate-x-0.5',
        ...nestedOpacity,
        ...nestedTranslate,
      ];
    }
    return [
      'opacity-40',
      CARD_HOVER_OPACITY,
      'group-hover/card:translate-x-0.5',
      'group-hover/card:-translate-y-0.5',
      ...nestedOpacity,
      ...nestedTranslate,
    ];
  }

  if (expanded) {
    if (direction === 'down') {
      return ['opacity-100', 'translate-x-0.5', 'translate-y-0.5'];
    }
    if (direction === 'in') {
      return ['opacity-100', '-translate-x-0.5', 'translate-y-0.5'];
    }
    if (direction === 'left') {
      return ['opacity-100', '-translate-x-0.5'];
    }
    return ['opacity-100', 'translate-x-0.5', '-translate-y-0.5'];
  }

  if (direction === 'down') {
    return [
      'opacity-40',
      'group-hover:opacity-100',
      'group-hover:translate-x-0.5',
      'group-hover:translate-y-0.5',
    ];
  }
  if (direction === 'in') {
    return [
      'opacity-40',
      'group-hover:opacity-100',
      'group-hover:-translate-x-0.5',
      'group-hover:translate-y-0.5',
    ];
  }
  if (direction === 'left') {
    return [
      'opacity-40',
      'group-hover:opacity-100',
      'group-hover:-translate-x-0.5',
    ];
  }
  return [
    'opacity-40',
    'group-hover:opacity-100',
    'group-hover:translate-x-0.5',
    'group-hover:-translate-y-0.5',
  ];
}

export function ProtocolMotionArrow({
  direction = 'up',
  className,
  groupName,
  static: isStatic = false,
  expanded = false,
  resetOnNestedInteractiveHover = false,
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
        motionEnabled && 'transition-all duration-200',
        ...motionClasses({
          direction,
          groupName,
          motionEnabled,
          expanded,
          resetOnNestedInteractiveHover,
        }),
        direction === 'down' && 'rotate-90',
        direction === 'in' && 'rotate-180',
        className
      )}
    />
  );
}
