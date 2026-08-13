'use client';

import type { ReactNode } from 'react';

export type AmountFieldMetaRowTone = 'storage' | 'support';

/**
 * Presets / Max / balance row under {@link AmountField}.
 * Storage uses `.app-storage-quick-row`; support/commerce uses `.profile-support-quick-row`.
 */
export function AmountFieldMetaRow({
  presets,
  selectedValue,
  onSelectPreset,
  max,
  meta,
  disabled = false,
  presetsAriaLabel = 'Quick amounts',
  tone = 'storage',
  className,
}: {
  presets?: readonly string[];
  selectedValue?: string;
  onSelectPreset?: (preset: string) => void;
  max?: {
    onClick: () => void;
    disabled?: boolean;
    label?: string;
    /**
     * When false, render an invisible layout placeholder instead of Max
     * (storage withdraw with nothing withdrawable).
     */
    available?: boolean;
    /** Blue tint — storage withdraw Max. */
    variant?: 'default' | 'action';
  };
  meta?: ReactNode;
  disabled?: boolean;
  presetsAriaLabel?: string;
  tone?: AmountFieldMetaRowTone;
  className?: string;
}) {
  const rowClass =
    tone === 'support' ? 'profile-support-quick-row' : 'app-storage-quick-row';
  const metaClass =
    tone === 'support' ? 'profile-support-balance' : 'app-storage-amount-meta';
  const presetsClass =
    tone === 'support'
      ? 'app-storage-presets profile-support-presets'
      : 'app-storage-presets';

  const showPresets = Boolean(presets?.length && onSelectPreset);
  const maxAvailable = max?.available !== false;
  const maxDisabled = Boolean(disabled || max?.disabled);
  const maxLabel = max?.label ?? 'Max';
  const showMax = max != null && maxAvailable;
  const showMaxPlaceholder = max != null && !maxAvailable;

  return (
    <div className={className ? `${rowClass} ${className}` : rowClass}>
      {showPresets ? (
        <div
          className={presetsClass}
          role="group"
          aria-label={presetsAriaLabel}
        >
          {presets!.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`os-surface-chip${
                selectedValue === preset ? ' is-selected' : ''
              }`}
              disabled={disabled}
              onClick={() => onSelectPreset!(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      ) : null}

      {showMax ? (
        <div
          className={presetsClass}
          role="group"
          aria-label={presetsAriaLabel}
        >
          <button
            type="button"
            className={
              max!.variant === 'action'
                ? 'os-surface-chip app-storage-preset--action'
                : 'os-surface-chip'
            }
            disabled={maxDisabled}
            onClick={max!.onClick}
          >
            {maxLabel}
          </button>
        </div>
      ) : null}

      {showMaxPlaceholder ? (
        <span aria-hidden className="app-storage-max-placeholder">
          {maxLabel}
        </span>
      ) : null}

      {meta != null ? <p className={metaClass}>{meta}</p> : null}
    </div>
  );
}
