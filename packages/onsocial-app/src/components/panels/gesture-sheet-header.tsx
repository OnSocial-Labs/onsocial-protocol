'use client';

import type { ReactNode } from 'react';
import { SheetCloseButton } from '@onsocial/ui';

export type GestureSheetSignal = 'reputation' | 'endorse' | 'standing';

interface GestureSheetHeaderProps {
  titleId: string;
  /** Gesture verb — Support, Endorse, Sell, … */
  verb: string;
  /** Person display name fused into the title. Omit for self/action sheets. */
  personName?: string;
  /** Quiet @handle under the title. Omit when unused or redundant. */
  handle?: string;
  /** Face-gesture signal hue for the verb. */
  signal: GestureSheetSignal;
  closeAriaLabel: string;
  onClose: () => void;
  /** Optional one-line relationship whisper (first support, etc.). */
  whisper?: ReactNode;
}

/**
 * Shared chrome for social gesture sheets (Support, Endorse compose).
 * One title beat: verb + optional person; quiet handle; no duplicate face-card strip.
 * Title uses a paragraph (not h2) so type matches standing subject — UA
 * heading styles would otherwise beat layered sheet CSS.
 */
export function GestureSheetHeader({
  titleId,
  verb,
  personName = '',
  handle = '',
  signal,
  closeAriaLabel,
  onClose,
  whisper = null,
}: GestureSheetHeaderProps) {
  const person = personName.trim();
  const handleLabel = handle.trim();

  return (
    <div className="standing-sheet-header gesture-sheet-header">
      <div className="gesture-sheet-header-top">
        <div className="gesture-sheet-header-copy">
          <p
            id={titleId}
            role="heading"
            aria-level={2}
            className="standing-sheet-subject-name gesture-sheet-title"
          >
            <span
              className={`gesture-sheet-verb gesture-sheet-verb--${signal}`}
            >
              {verb}
            </span>
            {person ? (
              <>
                {' '}
                <span className="gesture-sheet-person">{person}</span>
              </>
            ) : null}
          </p>
          {handleLabel ? (
            <p className="gesture-sheet-handle">@{handleLabel}</p>
          ) : null}
          {whisper ? (
            <p className="gesture-sheet-whisper">{whisper}</p>
          ) : null}
        </div>
        <SheetCloseButton onClick={onClose} ariaLabel={closeAriaLabel} />
      </div>
    </div>
  );
}
