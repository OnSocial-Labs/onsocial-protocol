'use client';

import type { HTMLAttributes } from 'react';
import { cn } from './cn.js';
import { OsIconAction, osIconActionGlyphClassName } from './os-icon-action.js';
import { ChevronDownIcon, ChevronUpIcon } from './mage-stroke-icons.js';

/** Compact earlier/later controls beside an {@link OsSurfaceRow}. */
export const osOrderControlsClassName = 'os-order-controls';

export interface OsOrderControlsProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  earlierLabel: string;
  laterLabel: string;
  onEarlier: () => void;
  onLater: () => void;
  earlierDisabled?: boolean;
  laterDisabled?: boolean;
}

/**
 * Flat Mage ↑↓ hit targets for list reorder.
 * Pair with {@link OsSurfaceRowItem} so controls stay outside the row button.
 */
export function OsOrderControls({
  earlierLabel,
  laterLabel,
  onEarlier,
  onLater,
  earlierDisabled = false,
  laterDisabled = false,
  className,
  'aria-label': ariaLabel = 'Reorder',
  ...props
}: OsOrderControlsProps) {
  return (
    <div
      className={cn(osOrderControlsClassName, className)}
      role="group"
      aria-label={ariaLabel}
      {...props}
    >
      <OsIconAction
        ariaLabel={earlierLabel}
        disabled={earlierDisabled}
        onClick={onEarlier}
      >
        <ChevronUpIcon className={osIconActionGlyphClassName} aria-hidden />
      </OsIconAction>
      <OsIconAction
        ariaLabel={laterLabel}
        disabled={laterDisabled}
        onClick={onLater}
      >
        <ChevronDownIcon className={osIconActionGlyphClassName} aria-hidden />
      </OsIconAction>
    </div>
  );
}
