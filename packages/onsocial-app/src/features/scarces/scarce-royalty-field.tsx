'use client';

import {
  DEFAULT_ROYALTY_BPS,
  MAX_ROYALTY_BPS,
  ROYALTY_PRESETS,
  formatRoyaltyPercent,
  normalizeCustomRoyaltyInput,
  parseCustomRoyaltyBps,
} from '@/features/scarces/scarce-royalty';

/**
 * Shared resale royalty chips (None / 5 / 10 / 15 / Custom) used by list-from-post
 * and create-drop.
 */
export function ScarceRoyaltyField({
  royaltyBps,
  isCustomRoyalty,
  customRoyaltyInput,
  pending = false,
  hint,
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
  onRoyaltyBpsChange: (bps: number) => void;
  onCustomRoyaltyChange: (raw: string) => void;
  onCustomToggle: (custom: boolean) => void;
}) {
  const customRoyaltyBps = parseCustomRoyaltyBps(customRoyaltyInput);
  const resolvedRoyaltyBps = isCustomRoyalty ? customRoyaltyBps : royaltyBps;
  const defaultHint = `Keep first sales after 2%.${
    resolvedRoyaltyBps != null && resolvedRoyaltyBps > 0
      ? ` Creator earns ${formatRoyaltyPercent(resolvedRoyaltyBps)}% on resales.`
      : ' No resale cut.'
  }`;

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
              !isCustomRoyalty && royaltyBps === preset.bps ? ' is-selected' : ''
            }`}
            disabled={pending}
            onClick={() => {
              onRoyaltyBpsChange(preset.bps);
              onCustomToggle(false);
            }}
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
      <p className="profile-support-hint scarce-royalty-hint">
        {hint ?? defaultHint}
      </p>
    </div>
  );
}

export { DEFAULT_ROYALTY_BPS, parseCustomRoyaltyBps };
