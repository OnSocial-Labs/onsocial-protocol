'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeftIcon, OsIconAction } from '@onsocial/ui';

/** Opt-in header leave. Screens use `dockBack` by default — do not imply this. */
interface ContextualBackProps {
  fallbackHref?: string;
}

export function ContextualBack({ fallbackHref = '/' }: ContextualBackProps) {
  const router = useRouter();

  return (
    <OsIconAction
      ariaLabel="Back"
      onClick={() => {
        router.push(fallbackHref);
      }}
    >
      <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}
