'use client';

import type { ReactNode } from 'react';
import { cn } from './cn.js';

export type AmountFieldMetaRowTone = 'storage' | 'support';

/**
 * Presets / Max / balance row under {@link AmountField}.
 * Pair with `os-amount-field.css`.
 * Tone aliases: storage → `.app-storage-quick-row`; support → `.profile-support-quick-row`.
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
    tone === 'support'
      ? 'os-amount-field-meta-row profile-support-quick-row'
      : 'os-amount-field-meta-row app-storage-quick-row';
  const metaClass =
    tone === 'support'
      ? 'os-amount-field-meta profile-support-balance'
      : 'os-amount-field-meta app-storage-amount-meta';
  const presetsClass =
    tone === 'support'
      ? 'os-amount-field-presets app-storage-presets profile-support-presets'
      : 'os-amount-field-presets app-storage-presets';

  const showPresets = Boolean(presets?.length && onSelectPreset);
  const maxAvailable = max?.available !== false;
  const maxDisabled = Boolean(disabled || max?.disabled);
  const maxLabel = max?.label ?? 'Max';
  const showMax = max != null && maxAvailable;
  const showMaxPlaceholder = max != null && !maxAvailable;

  return (
    <div className={cn(rowClass, className)}>
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
              className={cn(
                'os-surface-chip',
                selectedValue === preset && 'is-selected'
              )}
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
            className={cn(
              'os-surface-chip',
              max!.variant === 'action' && 'os-amount-field-preset-action',
              max!.variant === 'action' && 'app-storage-preset--action'
            )}
            disabled={maxDisabled}
            onClick={max!.onClick}
          >
            {maxLabel}
          </button>
        </div>
      ) : null}

      {showMaxPlaceholder ? (
        <span
          aria-hidden
          className="os-amount-field-max-placeholder app-storage-max-placeholder"
        >
          {maxLabel}
        </span>
      ) : null}

      {meta != null ? <p className={metaClass}>{meta}</p> : null}
    </div>
  );
}
