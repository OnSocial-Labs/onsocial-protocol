'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, OsIconAction } from '@onsocial/ui';

interface ContextualBackProps {
  fallbackHref?: string;
  /** Programmatic back (e.g. close a thread pane) instead of history. */
  onBack?: () => void;
  ariaLabel?: string;
}

export function ContextualBack({
  fallbackHref = '/',
  onBack,
  ariaLabel = 'Back',
}: ContextualBackProps) {
  const router = useRouter();

  return (
    <OsIconAction
      ariaLabel={ariaLabel}
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
      <ArrowLeftIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}
