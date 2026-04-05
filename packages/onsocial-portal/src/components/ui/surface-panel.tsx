import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const surfacePanelVariants = cva('border', {
  variants: {
    radius: {
      default: 'rounded-[1rem]',
      md: 'rounded-[1.25rem]',
      xl: 'rounded-[1.5rem]',
    },
    tone: {
      default: 'bg-background/55',
      subtle: 'bg-background/30',
      soft: 'bg-background/40',
      solid: 'bg-background/50',
      inset: 'bg-background/35',
      deep: 'bg-background/20',
      clear: 'bg-background/70',
      muted: 'bg-muted/30',
    },
    borderTone: {
      default: 'border-border/50',
      strong: 'border-border/70',
      faint: 'border-border/30',
      subtle: 'border-border/40',
    },
    padding: {
      default: 'p-4',
      snug: 'p-3 md:p-4',
      roomy: 'p-5 md:p-6',
      spacious: 'p-6 md:p-8',
      none: '',
    },
    interactive: {
      true: 'transition-colors hover:border-border',
      false: '',
    },
  },
  defaultVariants: {
    radius: 'default',
    tone: 'default',
    borderTone: 'default',
    padding: 'default',
    interactive: false,
  },
});

type SurfacePanelProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof surfacePanelVariants>;

export function SurfacePanel({
  className,
  radius,
  tone,
  borderTone,
  padding,
  interactive,
  ...props
}: SurfacePanelProps) {
  return (
    <div
      className={cn(
        surfacePanelVariants({
          radius,
          tone,
          borderTone,
          padding,
          interactive,
        }),
        className
      )}
      {...props}
    />
  );
}
