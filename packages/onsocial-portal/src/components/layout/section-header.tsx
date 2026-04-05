'use client';

import type { ReactNode } from 'react';
import { PortalBadge } from '@/components/ui/portal-badge';
import type { PortalAccent } from '@/lib/portal-colors';
import { cn } from '@/lib/utils';

const accentTextClass: Record<PortalAccent, string> = {
  blue: 'portal-blue-text',
  green: 'portal-green-text',
  purple: 'portal-purple-text',
  amber: 'portal-amber-text',
  red: 'portal-red-text',
  slate: 'text-muted-foreground',
  pink: 'portal-pink-text',
};

interface SectionHeaderProps {
  badge?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  badgeAccent?: PortalAccent;
  appearance?: 'label' | 'pill';
  size?: 'default' | 'compact' | 'display';
  align?: 'start' | 'center';
  className?: string;
  contentClassName?: string;
  descriptionClassName?: string;
  aside?: ReactNode;
}

export function SectionHeader({
  badge,
  title,
  description,
  badgeAccent = 'slate',
  appearance = 'label',
  size = 'default',
  align = 'start',
  className,
  contentClassName,
  descriptionClassName,
  aside,
}: SectionHeaderProps) {
  const compact = size === 'compact';
  const display = size === 'display';
  const centered = align === 'center';

  return (
    <div
      className={cn(
        display
          ? 'mb-6 flex flex-col gap-4'
          : compact
            ? 'mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between'
            : 'mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between',
        centered && 'items-center text-center',
        className
      )}
    >
      <div className={cn('min-w-0', centered && 'mx-auto', contentClassName)}>
        {badge ? (
          appearance === 'pill' ? (
            <PortalBadge
              accent={badgeAccent}
              size="sm"
              casing="uppercase"
              tracking="tight"
            >
              {badge}
            </PortalBadge>
          ) : (
            <span
              className={cn(
                compact
                  ? 'text-[11px] font-medium uppercase tracking-[0.18em]'
                  : 'text-sm font-medium uppercase tracking-[0.18em]',
                accentTextClass[badgeAccent]
              )}
            >
              {badge}
            </span>
          )
        ) : null}
        {title ? (
          <h2
            className={cn(
              badge ? 'mt-2' : null,
              compact
                ? 'text-lg font-semibold tracking-[-0.02em] md:text-xl'
                : display
                  ? 'text-4xl font-bold tracking-[-0.03em] md:text-5xl'
                  : 'text-2xl font-bold tracking-[-0.03em] md:text-3xl'
            )}
          >
            {title}
          </h2>
        ) : null}
        {description ? (
          <p
            className={cn(
              title || badge ? (compact ? 'mt-1.5' : 'mt-2') : null,
              compact
                ? 'max-w-2xl text-sm text-muted-foreground'
                : display
                  ? 'max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg'
                  : 'max-w-2xl text-sm text-muted-foreground',
              descriptionClassName
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {aside ? (
        <div
          className={cn(
            'max-w-xl text-sm text-muted-foreground',
            centered ? 'text-center' : 'md:text-right'
          )}
        >
          {aside}
        </div>
      ) : null}
    </div>
  );
}
