'use client';

import { useCallback, useState } from 'react';
import {
  DEFAULT_ROYALTY_BPS,
  MAX_ROYALTY_BPS,
  ROYALTY_PRESETS,
  formatRoyaltyPercent,
  formatRoyaltySplitChipValue,
  normalizeCustomRoyaltyInput,
  parseCustomRoyaltyBps,
  royaltySplitIsDefault,
  type RoyaltySplitShare,
} from '@/features/scarces/scarce-royalty';
import { ScarceRoyaltySplitSheet } from '@/features/scarces/scarce-royalty-split-sheet';
import { fallbackLabel } from '@/lib/profile-display';

/**
 * Shared resale royalty chips (None / 5 / 10 / 15 / Custom) used by list-from-post
 * and create-drop. Optional split sheet when a primary account is provided.
 */
export function ScarceRoyaltyField({
  royaltyBps,
  isCustomRoyalty,
  customRoyaltyInput,
  pending = false,
  hint,
  primaryAccountId,
  shares,
  onSharesChange,
  splitZIndex = 60,
  onRoyaltyBpsChange,
  onCustomRoyaltyChange,
  onCustomToggle,
}: {
  royaltyBps: number;
  isCustomRoyalty: boolean;
  customRoyaltyInput: string;
  pending?: boolean;
  /** Override the default “first sales / resales” hint. */
  hint?: string;
  /** Wallet that owns the default 100% share (signer / post author). */
  primaryAccountId?: string;
  shares?: RoyaltySplitShare[];
  onSharesChange?: (next: RoyaltySplitShare[]) => void;
  splitZIndex?: number;
  onRoyaltyBpsChange: (bps: number) => void;
  onCustomRoyaltyChange: (raw: string) => void;
  onCustomToggle: (custom: boolean) => void;
}) {
  const customRoyaltyBps = parseCustomRoyaltyBps(customRoyaltyInput);
  const resolvedRoyaltyBps = isCustomRoyalty ? customRoyaltyBps : royaltyBps;
  const splitEnabled =
    Boolean(primaryAccountId?.trim()) &&
    typeof onSharesChange === 'function' &&
    Array.isArray(shares);
  const activeShares = shares ?? [];
  const isSplit =
    splitEnabled &&
    resolvedRoyaltyBps != null &&
    resolvedRoyaltyBps > 0 &&
    !royaltySplitIsDefault(activeShares, primaryAccountId ?? '');

  const defaultHint = `Keep first sales after 2%.${
    resolvedRoyaltyBps != null && resolvedRoyaltyBps > 0
      ? isSplit
        ? ` ${formatRoyaltyPercent(resolvedRoyaltyBps)}% on resales · split ${activeShares.length} accounts.`
        : ` Creator earns ${formatRoyaltyPercent(resolvedRoyaltyBps)}% on resales.`
      : ' No resale cut.'
  }`;

  const [splitOpen, setSplitOpen] = useState(false);
  const [splitClosing, setSplitClosing] = useState(false);
  const [splitSession, setSplitSession] = useState(0);
  const canShowSplit =
    splitEnabled && resolvedRoyaltyBps != null && resolvedRoyaltyBps > 0;
  const splitSheetOpen = canShowSplit && splitOpen && !splitClosing;

  const requestSplitClose = useCallback(() => {
    setSplitClosing(true);
  }, []);

  const handleSplitClosed = useCallback(() => {
    setSplitClosing(false);
    setSplitOpen(false);
  }, []);

  const openSplit = useCallback(() => {
    setSplitSession((value) => value + 1);
    setSplitClosing(false);
    setSplitOpen(true);
  }, []);

  const selectPreset = useCallback(
    (bps: number) => {
      onRoyaltyBpsChange(bps);
      onCustomToggle(false);
      if (bps <= 0) {
        setSplitOpen(false);
        setSplitClosing(false);
      }
    },
    [onCustomToggle, onRoyaltyBpsChange]
  );

  const chipValue = formatRoyaltySplitChipValue(
    activeShares,
    primaryAccountId ?? '',
    fallbackLabel
  );

  return (
    <div className="scarce-royalty-field">
      <p className="scarce-mood-picker-label">Resale royalty</p>
      <div
        className="app-storage-presets"
        role="group"
        aria-label="Resale royalty"
      >
        {ROYALTY_PRESETS.map((preset) => (
          <button
            key={preset.bps}
            type="button"
            className={`os-surface-chip${
              !isCustomRoyalty && royaltyBps === preset.bps
                ? ' is-selected'
                : ''
            }`}
            disabled={pending}
            onClick={() => selectPreset(preset.bps)}
          >
            {preset.percent === 0 ? 'None' : `${preset.percent}%`}
          </button>
        ))}
        <button
          type="button"
          className={`os-surface-chip${isCustomRoyalty ? ' is-selected' : ''}`}
          disabled={pending}
          onClick={() => onCustomToggle(true)}
        >
          {isCustomRoyalty && customRoyaltyInput
            ? `Custom · ${customRoyaltyInput}%`
            : 'Custom'}
        </button>
      </div>
      {isCustomRoyalty ? (
        <div className="app-storage-amount-field profile-support-amount-field">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={customRoyaltyInput}
            onChange={(event) =>
              onCustomRoyaltyChange(
                (() => {
                  const next = normalizeCustomRoyaltyInput(event.target.value);
                  if (!next) return '';
                  if (next.endsWith('.')) {
                    return Number(next.slice(0, -1)) <= MAX_ROYALTY_BPS / 100
                      ? next
                      : customRoyaltyInput;
                  }
                  const bps = parseCustomRoyaltyBps(next);
                  return bps == null
                    ? customRoyaltyInput
                    : formatRoyaltyPercent(bps);
                })()
              )
            }
            placeholder="0–50"
            aria-label="Custom resale royalty percentage from 0 to 50"
            className="app-storage-amount-input"
            disabled={pending}
          />
          <span className="account-card-balance-unit profile-support-token-unit">
            %
          </span>
        </div>
      ) : null}

      {canShowSplit ? (
        <div className="app-storage-presets scarce-choice-chip-row">
          <button
            type="button"
            className={`os-surface-chip scarce-choice-chip${
              splitSheetOpen || isSplit ? ' is-selected' : ''
            }`}
            disabled={pending}
            aria-haspopup="dialog"
            aria-expanded={splitSheetOpen}
            aria-label={`Royalty split: ${chipValue}`}
            onClick={openSplit}
          >
            <span className="scarce-choice-chip-label">Split</span>
            <span className="scarce-choice-chip-value">{chipValue}</span>
          </button>
        </div>
      ) : null}

      <p className="profile-support-hint scarce-royalty-hint">
        {hint ?? defaultHint}
      </p>

      {splitEnabled && primaryAccountId && onSharesChange && canShowSplit ? (
        <ScarceRoyaltySplitSheet
          key={splitSession}
          open={splitSheetOpen}
          onClose={requestSplitClose}
          onClosed={handleSplitClosed}
          totalBps={resolvedRoyaltyBps}
          primaryAccountId={primaryAccountId}
          shares={
            activeShares.length > 0
              ? activeShares
              : [{ accountId: primaryAccountId, percent: 100 }]
          }
          onSharesChange={onSharesChange}
          pending={pending}
          zIndex={splitZIndex}
        />
      ) : null}
    </div>
  );
}

export { DEFAULT_ROYALTY_BPS, parseCustomRoyaltyBps };
export type { RoyaltySplitShare };
