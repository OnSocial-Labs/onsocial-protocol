'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, OsIconAction } from '@onsocial/ui';
import { resolveOsLeave } from '@/lib/os-leave';

interface OsHeaderBackProps {
  fallbackHref: string;
  ariaLabel?: string;
  onBack?: () => void;
}

/**
 * Compact-chrome leave — chevron in the header on composer-first screens
 * (Post, Messages thread) so the write dock stays avatar + field only.
 */
export function OsHeaderBack({
  fallbackHref,
  ariaLabel = 'Back',
  onBack,
}: OsHeaderBackProps) {
  const router = useRouter();

  return (
    <OsIconAction
      ariaLabel={ariaLabel}
      onClick={() => {
        const leave = resolveOsLeave({ onBack, fallbackHref });
        if (leave.kind === 'callback') {
          onBack?.();
          return;
        }
        router.push(leave.href);
      }}
    >
      <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}
