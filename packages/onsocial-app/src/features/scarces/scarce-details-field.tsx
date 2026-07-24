'use client';

import { useCallback, useId, useState } from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';

const CHIP_VALUE_CHARS = 28;

interface ScarceDetailsFieldProps {
  title: string;
  description?: string | null;
  disabled?: boolean;
}

/**
 * Compact Details chip for the list sheet. Title + body live here so the
 * cover preview is not repeated three times on the main form.
 */
export function ScarceDetailsField({
  title,
  description = null,
  disabled = false,
}: ScarceDetailsFieldProps) {
  const titleId = useId();
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

  useScrollLock(sheetOpen);

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
        className={`os-surface-chip scarce-choice-chip${
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
        <span className="scarce-choice-chip-label">Details</span>
        <span className="scarce-choice-chip-value">{chipValue}</span>
      </button>

      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        tone="os"
        initialDetent="full"
        zIndex={60}
        ariaLabelledBy={titleId}
        backdropLabel="Close details"
        panelClassName="scarce-choice-sheet-panel"
        bodyClassName="scarce-choice-sheet-body"
        header={
          <>
            <SheetHeader
              titleId={titleId}
              title="Details"
              subtitle="What wallets store for this scarce."
              onClose={requestClose}
              closeAriaLabel="Close details"
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
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
      </GlassSheet>
    </>
  );
}
