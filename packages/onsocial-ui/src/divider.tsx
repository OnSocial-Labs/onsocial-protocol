import { cn } from './cn.js';

export type DividerVariant = 'section' | 'detail' | 'item' | 'gold-detail';

export type DividerOrientation = 'horizontal' | 'vertical';

export interface DividerProps {
  variant?: DividerVariant;
  orientation?: DividerOrientation;
  className?: string;
}

const VARIANT_CLASS: Record<
  DividerVariant,
  { horizontal: string; vertical: string }
> = {
  section: { horizontal: 'divider-section', vertical: 'divider-v-section' },
  detail: { horizontal: 'divider-detail', vertical: 'divider-v-detail' },
  item: { horizontal: 'divider-item', vertical: 'divider-v-item' },
  'gold-detail': {
    horizontal: 'divider-gold-detail',
    vertical: 'divider-v-gold-detail',
  },
};

/** Gradient-fade divider — pair with dividers.css utilities. */
export function Divider({
  variant = 'detail',
  orientation = 'horizontal',
  className,
}: DividerProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div
      role="separator"
      aria-hidden
      className={cn(
        'shrink-0 border-0',
        isVertical ? 'w-px self-stretch' : 'h-px w-full',
        isVertical
          ? VARIANT_CLASS[variant].vertical
          : VARIANT_CLASS[variant].horizontal,
        className
      )}
    />
  );
}
