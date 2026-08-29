'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, OsIconAction } from '@onsocial/ui';

/*
 * Glyph convention: ArrowLeft always means "return to the previous
 * context" — history back (here), pop a pushed slide-over
 * (OsSlideOverScreen), or step back within a flow (drop studio).
 * Dismissal of sheets uses the × family (SheetCloseButton) instead.
 */
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
