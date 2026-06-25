'use client';

import {
  portalCompactActionPillClass,
  profileActionToneClass,
} from '@/components/ui/profile-action-pill';
import { cn } from '@/lib/utils';

export function SocialSpendAmountPill({
  children,
  selected = false,
  onClick,
  className,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        portalCompactActionPillClass,
        'min-w-[2.35rem] justify-center px-2.5 tabular-nums',
        selected && profileActionToneClass('green'),
        className
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
