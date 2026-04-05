import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { PortalAccent } from '@/lib/portal-colors';
import { cn } from '@/lib/utils';

const portalBadgeVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-full border',
  {
    variants: {
      accent: {
        blue: 'portal-blue-badge',
        green: 'portal-green-badge',
        purple: 'portal-purple-badge',
        amber: 'portal-amber-badge',
        red: 'portal-red-badge',
        slate: 'portal-slate-badge',
        pink: 'portal-pink-badge',
      },
      size: {
        xs: 'px-2 py-0.5 text-[11px] md:px-2.5 md:py-1 md:text-xs',
        sm: 'px-3 py-1 text-[11px]',
        icon: 'h-5 w-5 p-0 text-[10px]',
      },
      weight: {
        default: 'font-medium',
        semibold: 'font-semibold',
      },
      casing: {
        default: '',
        capitalize: 'capitalize',
        uppercase: 'uppercase',
      },
      tracking: {
        default: '',
        tight: 'tracking-[0.14em]',
        normal: 'tracking-[0.16em]',
      },
    },
    defaultVariants: {
      size: 'xs',
      weight: 'default',
      casing: 'default',
      tracking: 'default',
    },
  }
);

type PortalBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof portalBadgeVariants> & {
    accent: PortalAccent;
  };

export function PortalBadge({
  accent,
  size,
  weight,
  casing,
  tracking,
  className,
  ...props
}: PortalBadgeProps) {
  return (
    <span
      className={cn(
        portalBadgeVariants({ accent, size, weight, casing, tracking }),
        className
      )}
      {...props}
    />
  );
}
