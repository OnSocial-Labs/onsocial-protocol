'use client';

import type { MouseEvent } from 'react';
import { cn } from './cn.js';
import { MultiplyIcon } from './mage-stroke-icons.js';

export const osMediaDismissClassName = 'os-media-dismiss';

/**
 * Small photo dismiss. Same chip on a banner, avatar, guild mark, hub logo,
 * About still, and a composer attachment. The picture itself is the
 * add / replace target — this only removes.
 */
export function OsMediaDismiss({
  label,
  className,
  disabled,
  onClick,
}: {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(osMediaDismissClassName, className)}
      aria-label={label}
      disabled={disabled}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      <MultiplyIcon aria-hidden />
    </button>
  );
}
