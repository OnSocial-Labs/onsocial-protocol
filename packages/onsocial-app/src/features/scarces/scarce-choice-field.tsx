'use client';

import {
  useCallback,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Divider, GlassSheet, SheetHeader } from '@onsocial/ui';
import { useScrollLock } from '@/hooks/use-scroll-lock';

export interface ScarceChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Quiet secondary line under the label (tagline / char limit). */
  description?: string;
  /** Leading visual (swatch, mark glyph, etc.). */
  leading?: ReactNode;
  /** Optional group title — consecutive options with the same section share one header. */
  section?: string;
}

interface ScarceChoiceFieldProps<T extends string> {
  /** Field name shown in the drawer title and chip aria-label. */
  label: string;
  value: T;
  options: readonly ScarceChoiceOption<T>[];
  onChange: (next: T) => void;
  disabled?: boolean;
  /** Quiet line under the sheet title. */
  copy?: string;
  /** Optional hint under the option list in the drawer. */
  hint?: string;
  /** Leading visual on the summary chip (e.g. colour / finish swatch). */
  chipLeading?: ReactNode;
}

function CheckIcon() {
  return (
    <svg
      className="scarce-choice-sheet-check"
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

/**
 * Summary chip that opens a nested choice drawer. Keeps the list sheet short
 * on mobile: one tap shows the current value, another picks a replacement.
 */
export function ScarceChoiceField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  copy,
  hint,
  chipLeading,
}: ScarceChoiceFieldProps<T>) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const active = options.find((option) => option.value === value);
  const activeLabel = active?.label ?? value;
  const sheetOpen = open && !closing;

  const sections = useMemo(() => {
    const groups: { title: string | null; options: ScarceChoiceOption<T>[] }[] =
      [];
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
  }, [options]);

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
        aria-label={`${label}: ${activeLabel}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
      >
        {chipLeading ? (
          <span className="scarce-choice-chip-leading">{chipLeading}</span>
        ) : null}
        <span className="scarce-choice-chip-label">{label}</span>
        <span className="scarce-choice-chip-value">{activeLabel}</span>
      </button>

      <GlassSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        tone="os"
        // Content-sized panel: "full" means rest at natural height (no 62vh peek).
        initialDetent="full"
        zIndex={60}
        ariaLabelledBy={titleId}
        backdropLabel={`Close ${label.toLowerCase()}`}
        panelClassName="scarce-choice-sheet-panel"
        bodyClassName="scarce-choice-sheet-body"
        header={
          <>
            <SheetHeader
              titleId={titleId}
              title={label}
              {...(copy ? { subtitle: copy } : {})}
              onClose={requestClose}
              closeAriaLabel={`Close ${label.toLowerCase()}`}
            />
            <Divider variant="section" className="glass-sheet-header-divider" />
          </>
        }
      >
        <div
          className="scarce-choice-sheet-list"
          role="listbox"
          aria-label={label}
        >
          {sections.map((section, sectionIndex) => (
            <div
              key={section.title ?? `section-${sectionIndex}`}
              className="scarce-choice-sheet-section"
            >
              {section.title ? (
                <p className="scarce-choice-sheet-section-title">
                  {section.title}
                </p>
              ) : null}
              {section.options.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`scarce-choice-sheet-option${
                      selected ? ' is-selected' : ''
                    }`}
                    onClick={() => {
                      onChange(option.value);
                      requestClose();
                    }}
                  >
                    {option.leading ? (
                      <span className="scarce-choice-sheet-leading">
                        {option.leading}
                      </span>
                    ) : null}
                    <span className="scarce-choice-sheet-option-copy">
                      <span className="scarce-choice-sheet-option-label">
                        {option.label}
                      </span>
                      {option.description ? (
                        <span className="scarce-choice-sheet-option-desc">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {selected ? <CheckIcon /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {hint ? <p className="scarce-choice-sheet-hint">{hint}</p> : null}
      </GlassSheet>
    </>
  );
}
