'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from '@onsocial/ui';
import { resolveOsLeave } from '@/lib/os-leave';

interface OsDockBackZoneProps {
  fallbackHref: string;
  ariaLabel?: string;
  onBack?: () => void;
  /** Leading dock segment vs compact stack under avatar while composing. */
  variant?: 'segment' | 'stacked';
}

/** Leading summon segment — leave this place (parent), not browser history. */
export function OsDockBackZone({
  fallbackHref,
  ariaLabel = 'Back',
  onBack,
  variant = 'segment',
}: OsDockBackZoneProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={`portfolio-summon-back${
        variant === 'stacked' ? ' portfolio-summon-back--stacked' : ''
      }`}
      aria-label={ariaLabel}
      onClick={() => {
        const leave = resolveOsLeave({ onBack, fallbackHref });
        if (leave.kind === 'callback') {
          onBack?.();
          return;
        }
        router.push(leave.href);
      }}
    >
      <ChevronLeftIcon className="portfolio-summon-back-icon" aria-hidden />
    </button>
  );
}
