'use client';

import { useCallback, useState } from 'react';
import { OsHugSheet, osChoiceChipClassName } from '@onsocial/ui';

const CHIP_VALUE_CHARS = 28;

interface ScarceDetailsFieldProps {
  title: string;
  description?: string | null;
  disabled?: boolean;
  /** Stack above a parent commerce sheet. */
  zIndex?: number;
}

/**
 * Compact Details chip for the list sheet. Title + body live here so the
 * cover preview is not repeated three times on the main form.
 */
export function ScarceDetailsField({
  title,
  description = null,
  disabled = false,
  zIndex = 60,
}: ScarceDetailsFieldProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const resolvedTitle = title.trim() || 'Scarce';
  const body = description?.trim() || null;
  const showBody = Boolean(body && body !== resolvedTitle);
  const chipValue =
    resolvedTitle.length > CHIP_VALUE_CHARS
      ? `${resolvedTitle.slice(0, CHIP_VALUE_CHARS).trimEnd()}…`
      : resolvedTitle;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        className={`os-surface-chip ${osChoiceChipClassName}${
          open || closing ? ' is-selected' : ''
        }`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={`Details: ${resolvedTitle}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
      >
        <span className="os-choice-chip-label">Details</span>
        <span className="os-choice-chip-value">{chipValue}</span>
      </button>

      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label="Details"
        copy="What wallets store for this scarce."
        closeAriaLabel="Close details"
        backdropLabel="Close details"
        zIndex={zIndex}
      >
        <div className="scarce-details-sheet">
          <div className="scarce-details-row">
            <p className="scarce-details-label">Title</p>
            <p className="scarce-details-value">{resolvedTitle}</p>
          </div>
          {showBody && body ? (
            <div className="scarce-details-row">
              <p className="scarce-details-label">Description</p>
              <p className="scarce-details-value scarce-details-value--body">
                {body}
              </p>
            </div>
          ) : null}
        </div>
      </OsHugSheet>
    </>
  );
}
