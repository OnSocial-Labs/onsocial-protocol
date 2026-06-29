'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, osIconActionClassName } from '@onsocial/ui';

interface ContextualBackProps {
  fallbackHref?: string;
}

export function ContextualBack({ fallbackHref = '/' }: ContextualBackProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={osIconActionClassName}
      aria-label="Back"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <ArrowLeftIcon className="glass-sheet-close-icon" aria-hidden />
    </button>
  );
}
