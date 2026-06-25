'use client';

import { useRouter } from 'next/navigation';

interface ContextualBackProps {
  fallbackHref?: string;
}

export function ContextualBack({ fallbackHref = '/' }: ContextualBackProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className="contextual-back"
      aria-label="Back"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <span aria-hidden>←</span>
    </button>
  );
}
