'use client';

import type { ReactNode } from 'react';
import { SheetCloseButton } from './glass-sheet.js';
import { standingIdentityAccountCopy } from './standing-identity.js';

export type GestureSheetSignal =
  | 'reputation'
  | 'endorse'
  | 'standing'
  | 'message';

export interface GestureSheetHeaderProps {
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
 * Shared chrome for social / commerce gesture sheets.
 * One title beat: verb + optional person; quiet handle; no duplicate face-card strip.
 * Title uses a paragraph (not h2) so type matches standing subject — UA
 * heading styles would otherwise beat layered sheet CSS.
 *
 * Pair with `os-gesture-sheet-header.css` (+ host `.standing-sheet-header`).
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
  const handleLine = handle.trim()
    ? standingIdentityAccountCopy(handle)
    : '';

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
          {handleLine ? (
            <p className="gesture-sheet-handle">{handleLine}</p>
          ) : null}
          {whisper ? <p className="gesture-sheet-whisper">{whisper}</p> : null}
        </div>
        <SheetCloseButton onClick={onClose} ariaLabel={closeAriaLabel} />
      </div>
    </div>
  );
}
