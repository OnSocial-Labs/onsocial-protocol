'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ChevronDownIcon } from './mage-stroke-icons.js';
import {
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  osFloatingPanelTriggerMetaClassName,
} from './floating-panel.js';
import { OsHugSheet } from './os-hug-sheet.js';
import { osChoiceChipClassName } from './os-choice-tokens.js';

export {
  osChoiceChipClassName,
  osChoiceSheetBodyClassName,
  osChoiceSheetPanelClassName,
} from './os-choice-tokens.js';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Quiet secondary line under the label (tagline / char limit). */
  description?: string;
  /** Leading visual (swatch, count badge-as-icon, mark glyph). */
  leading?: ReactNode;
  /** Quiet meta after the label when needed — prefer leading for icon-like marks. */
  trailing?: ReactNode;
  /** Optional group title — consecutive options with the same section share one header. */
  section?: string;
  disabled?: boolean;
}

function CheckIcon() {
  return (
    <svg
      className="os-choice-sheet-check"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
    >
      <path
        d="M3.5 8.2 6.6 11.2 12.5 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function groupOptions<T extends string>(
  options: readonly ChoiceOption<T>[]
): { title: string | null; options: ChoiceOption<T>[] }[] {
  const groups: { title: string | null; options: ChoiceOption<T>[] }[] = [];
  for (const option of options) {
    const title = option.section?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.title === title) {
      last.options.push(option);
    } else {
      groups.push({ title, options: [option] });
    }
  }
  return groups;
}

export interface ChoiceDrawerProps<T extends string> {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (next: T) => void;
  copy?: string;
  hint?: string;
  closeOnSelect?: boolean;
  zIndex?: number;
}

/**
 * Content-hugging pick-one sheet. Use with a chip (`ChoiceDrawerField`) or
 * pill trigger (`ChoiceDrawerMenu`). Pair with `os-choice-drawer.css`.
 */
export function ChoiceDrawer<T extends string>({
  open,
  onClose,
  onClosed,
  label,
  value,
  options,
  onChange,
  copy,
  hint,
  closeOnSelect = true,
  zIndex = 60,
}: ChoiceDrawerProps<T>) {
  const sections = useMemo(() => groupOptions(options), [options]);

  return (
    <OsHugSheet
      open={open}
      onClose={onClose}
      onClosed={onClosed}
      label={label}
      copy={copy}
      zIndex={zIndex}
      chrome="choice"
    >
      <div className="os-choice-sheet-list" role="listbox" aria-label={label}>
        {sections.map((section, sectionIndex) => (
          <div
            key={section.title ?? `section-${sectionIndex}`}
            className="os-choice-sheet-section"
          >
            {section.title ? (
              <p className="os-choice-sheet-section-title">{section.title}</p>
            ) : null}
            {section.options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  className={`os-choice-sheet-option${
                    selected ? ' is-selected' : ''
                  }`}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    if (closeOnSelect) onClose();
                  }}
                >
                  {option.leading ? (
                    <span className="os-choice-sheet-leading">
                      {option.leading}
                    </span>
                  ) : null}
                  <span className="os-choice-sheet-option-copy">
                    <span className="os-choice-sheet-option-primary">
                      <span className="os-choice-sheet-option-label">
                        {option.label}
                      </span>
                      {option.trailing ? (
                        <span className="os-choice-sheet-trailing">
                          {option.trailing}
                        </span>
                      ) : null}
                    </span>
                    {option.description ? (
                      <span className="os-choice-sheet-option-desc">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`os-choice-sheet-check-slot${
                      selected ? ' is-visible' : ''
                    }`}
                    aria-hidden
                  >
                    <CheckIcon />
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {hint ? <p className="os-choice-sheet-hint">{hint}</p> : null}
    </OsHugSheet>
  );
}

export interface ChoiceDrawerFieldProps<T extends string> {
  /** Field name shown in the drawer title and chip aria-label. */
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Quiet line under the sheet title. */
  copy?: string;
  /** Optional hint under the option list in the drawer. */
  hint?: string;
  /** Leading visual on the summary chip (e.g. colour / finish swatch). */
  chipLeading?: ReactNode;
  /**
   * Keep the chip in the selected (green) state while a value is set —
   * not only while the drawer is open.
   */
  persistSelected?: boolean;
  /**
   * Close the drawer when an option is tapped (default). Style pickers pass
   * false so people can iterate — the live preview above updates in place.
   */
  closeOnSelect?: boolean;
  /** Stack above a parent commerce sheet (e.g. list at 90 → nest at 110). */
  zIndex?: number;
}

/**
 * Summary chip that opens a nested choice drawer. Keeps the parent sheet
 * short on mobile: one tap shows the current value, another picks a
 * replacement.
 */
export function ChoiceDrawerField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  copy,
  hint,
  chipLeading,
  persistSelected = false,
  closeOnSelect = true,
  zIndex = 60,
}: ChoiceDrawerFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const active = options.find((option) => option.value === value);
  const activeLabel = active?.label ?? value;
  const sheetOpen = open && !closing;
  const chipSelected = open || closing || (persistSelected && Boolean(value));

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
          chipSelected ? ' is-selected' : ''
        }`}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={`${label}: ${activeLabel}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
      >
        {chipLeading ? (
          <span className="os-choice-chip-leading">{chipLeading}</span>
        ) : null}
        <span className="os-choice-chip-label">{label}</span>
        <span className="os-choice-chip-value">{activeLabel}</span>
      </button>

      <ChoiceDrawer
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        copy={copy}
        hint={hint}
        closeOnSelect={closeOnSelect}
        zIndex={zIndex}
      />
    </>
  );
}

export interface ChoiceDrawerMenuProps<T extends string> {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  copy?: string;
  hint?: string;
  /** Extra trigger meta before the chevron (e.g. count badge). */
  triggerMeta?: ReactNode;
  ariaLabel?: string;
  className?: string;
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
  zIndex?: number;
}

/**
 * Toolbar pill that opens the shared choice drawer — standing view switcher,
 * market sort, and other pick-one menus.
 */
export function ChoiceDrawerMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  copy,
  hint,
  triggerMeta,
  ariaLabel,
  className,
  triggerClassName,
  onOpenChange,
  zIndex = 60,
}: ChoiceDrawerMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetOpen = open && !closing;
  const activeLabel =
    options.find((option) => option.value === value)?.label ?? value;

  useEffect(() => {
    onOpenChange?.(sheetOpen);
    return () => onOpenChange?.(false);
  }, [onOpenChange, sheetOpen]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setOpen(false);
  }, []);

  return (
    <div className={className ?? 'standing-view-menu'}>
      <button
        type="button"
        className={`${osFloatingPanelTriggerClassName}${
          sheetOpen ? ' is-open' : ''
        }${triggerClassName ? ` ${triggerClassName}` : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        aria-label={
          ariaLabel ??
          (sheetOpen
            ? `Close ${label.toLowerCase()} menu`
            : `Open ${label.toLowerCase()} menu`)
        }
      >
        <span className={osFloatingPanelTriggerLabelClassName}>
          {activeLabel}
        </span>
        <span className={osFloatingPanelTriggerMetaClassName}>
          {triggerMeta}
          <ChevronDownIcon
            className={`${osFloatingPanelTriggerChevronClassName}${
              sheetOpen ? ' is-open' : ''
            }`}
            aria-hidden
          />
        </span>
      </button>

      <ChoiceDrawer
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        label={label}
        value={value}
        options={options}
        onChange={onChange}
        copy={copy}
        hint={hint}
        zIndex={zIndex}
      />
    </div>
  );
}
