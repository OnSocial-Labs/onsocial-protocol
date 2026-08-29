'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, OsIconAction } from '@onsocial/ui';

interface ContextualBackProps {
  fallbackHref?: string;
}

export function ContextualBack({ fallbackHref = '/' }: ContextualBackProps) {
  const router = useRouter();

  return (
    <OsIconAction
      ariaLabel="Back"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}
