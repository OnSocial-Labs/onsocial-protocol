'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon } from '@onsocial/ui';

interface OsDockBackZoneProps {
  fallbackHref: string;
  ariaLabel?: string;
  onBack?: () => void;
  /** Leading dock segment vs compact stack under avatar while composing. */
  variant?: 'segment' | 'stacked';
}

/** Leading summon segment — mirrors header contextual back. */
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
        if (onBack) {
          onBack();
          return;
        }
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <ChevronLeftIcon className="portfolio-summon-back-icon" aria-hidden />
    </button>
  );
}
