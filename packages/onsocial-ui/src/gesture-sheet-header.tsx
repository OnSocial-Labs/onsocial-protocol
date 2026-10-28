'use client';

import type { ReactNode } from 'react';
import { SheetHeader } from './glass-sheet.js';
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
  /** When set, the person name links to their profile. No second face in the body. */
  personHref?: string;
  /**
   * Accessible name override for the title — record sheets whose visible
   * title is just the topic (the who lives in the body) still name the
   * dialog after the people.
   */
  titleLabel?: string;
  /** Quiet @handle under the title. Omit when unused or redundant. */
  handle?: string;
  /** Work title under the verb (Amplify). Omit when the post has no named work. */
  subject?: string;
  /** Face-gesture signal hue for the verb. */
  signal: GestureSheetSignal;
  closeAriaLabel: string;
  onClose: () => void;
  /** Optional one-line relationship whisper (first support, etc.). */
  whisper?: ReactNode;
}

/**
 * Gesture copy on the shared sheet header. Verb, person, handle, and
 * whisper stay gesture-specific. The row, close button, and type come
 * from `SheetHeader`.
 */
export function GestureSheetHeader({
  titleId,
  verb,
  personName = '',
  personHref = '',
  titleLabel = '',
  handle = '',
  subject = '',
  signal,
  closeAriaLabel,
  onClose,
  whisper = null,
}: GestureSheetHeaderProps) {
  const person = personName.trim();
  const workTitle = subject.trim();
  const handleLine = handle.trim() ? standingIdentityAccountCopy(handle) : '';
  const detail =
    workTitle || handleLine || whisper ? (
      <>
        {workTitle ? (
          <span className="gesture-sheet-subject">{workTitle}</span>
        ) : null}
        {handleLine ? (
          <span className="gesture-sheet-handle">{handleLine}</span>
        ) : null}
        {whisper ? (
          <span className="gesture-sheet-whisper">{whisper}</span>
        ) : null}
      </>
    ) : undefined;

  return (
    <SheetHeader
      className="gesture-sheet-header"
      titleId={titleId}
      {...(titleLabel ? { titleLabel } : {})}
      title={
        <>
          <span className={`gesture-sheet-verb gesture-sheet-verb--${signal}`}>
            {verb}
          </span>
          {person ? (
            <>
              {' '}
              {personHref ? (
                <a className="gesture-sheet-person" href={personHref}>
                  {person}
                </a>
              ) : (
                <span className="gesture-sheet-person">{person}</span>
              )}
            </>
          ) : null}
        </>
      }
      {...(detail ? { subtitle: detail } : {})}
      onClose={onClose}
      closeAriaLabel={closeAriaLabel}
    />
  );
}
