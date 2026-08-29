'use client';

import { useRouter } from 'next/navigation';
import { MultiplyIcon, OsIconAction } from '@onsocial/ui';
import { OS_INDEX_LEAVE_HREF } from '@/lib/os-leave';

/** Opt-in header mode-close (×). Leave a place with `dockBack`. */
interface ContextualBackProps {
  fallbackHref?: string;
}

export function ContextualBack({ fallbackHref = OS_INDEX_LEAVE_HREF }: ContextualBackProps) {
  const router = useRouter();

  return (
    <OsIconAction
      ariaLabel="Close"
      onClick={() => {
        router.push(fallbackHref);
      }}
    >
      <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
    </OsIconAction>
  );
}
