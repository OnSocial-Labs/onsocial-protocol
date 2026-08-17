'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type FocusEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { PortfolioLinkIcon } from '@/components/portfolio/portfolio-link-icon';
import {
  formatProfileLinkForEditor,
  isProfileLinkEditorPreviewable,
  profileLinkEditorInlineError,
  PROFILE_LINK_EDITOR_FIELDS,
  type ProfileLinkKind,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import { PAGE_LINK_NOTE_MAX } from '@/lib/page-launch-config';

interface ProfileLinkInputRowProps {
  field: (typeof PROFILE_LINK_EDITOR_FIELDS)[number];
  value: string;
  note?: string;
  error?: string;
  inputRef: (node: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
  onNoteChange?: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function ProfileLinkInputRow({
  field,
  value,
  note,
  error,
  inputRef,
  onChange,
  onNoteChange,
  onCommit,
  onCancel,
}: ProfileLinkInputRowProps) {
  const inlineError = error ? profileLinkEditorInlineError(field.kind) : null;
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const titlePlaceholder =
    field.kind === 'website' ? 'My website' : 'Optional title';

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopPropagation();
      onCancel();
    }
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const fieldEl = event.currentTarget.closest('.account-editor-link-field');
    const next = event.relatedTarget;
    if (next instanceof Node && fieldEl?.contains(next)) {
      return;
    }
    onCommit();
  };

  return (
    <div className="account-editor-link-field">
      <span
        className={`account-editor-link-input${error ? ' is-invalid' : ''}`}
      >
        <span className="account-editor-link-icon-slot" aria-hidden>
          <PortfolioLinkIcon kind={field.kind} className="portfolio-link-icon" />
        </span>
        <input
          ref={inputRef}
          className="account-editor-link-value"
          value={value}
          placeholder={field.placeholder}
          aria-label={field.label}
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? `${field.key}-error` : undefined}
          maxLength={field.kind === 'website' ? 255 : 80}
          inputMode={field.kind === 'website' ? 'url' : undefined}
          autoComplete={field.kind === 'website' ? 'url' : 'off'}
          onFocus={scrollFieldIntoView}
          onChange={(event) => onChange(event.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {inlineError ? (
          <span
            id={`${field.key}-error`}
            className="account-editor-link-inline-error"
            role="alert"
            aria-live="polite"
          >
            {inlineError}
          </span>
        ) : null}
        {error ? <span className="sr-only">{error}</span> : null}
        <button
          type="button"
          className="account-editor-link-cancel"
          aria-label={`Cancel ${field.label}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCancel}
        >
          <MultiplyIcon aria-hidden className="account-editor-link-cancel-icon" />
        </button>
      </span>
      {onNoteChange ? (
        <input
          className="account-editor-link-title"
          value={note ?? ''}
          placeholder={titlePlaceholder}
          aria-label={`${field.label} title`}
          maxLength={PAGE_LINK_NOTE_MAX}
          autoComplete="off"
          onFocus={scrollFieldIntoView}
          onChange={(event) =>
            onNoteChange(event.target.value.slice(0, PAGE_LINK_NOTE_MAX))
          }
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
      ) : null}
    </div>
  );
}

function profileLinksHasInput(links: ProfileLinksInput) {
  return PROFILE_LINK_EDITOR_FIELDS.some((field) => links[field.key].trim());
}

interface ProfileLinksEditorProps {
  links: ProfileLinksInput;
  fieldErrors: Partial<Record<keyof ProfileLinksInput, string>>;
  notes?: Record<string, string>;
  onUpdateLink: (key: keyof ProfileLinksInput, value: string) => void;
  onUpdateNote?: (key: keyof ProfileLinksInput, value: string) => void;
  onClearFieldError: (key: keyof ProfileLinksInput) => void;
  onSetFieldError: (key: keyof ProfileLinksInput, error: string | null) => void;
}

export function ProfileLinksEditor({
  links,
  fieldErrors,
  notes,
  onUpdateLink,
  onUpdateNote,
  onClearFieldError,
  onSetFieldError,
}: ProfileLinksEditorProps) {
  const [editingKey, setEditingKey] = useState<keyof ProfileLinksInput | null>(
    null
  );
  const [pickerOpen, setPickerOpen] = useState(
    () => !profileLinksHasInput(links)
  );
  const inputRefs = useRef<
    Partial<Record<keyof ProfileLinksInput, HTMLInputElement | null>>
  >({});
  const editBaselineRef = useRef<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const noteBaselineRef = useRef<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});

  const previewFields = useMemo(
    () =>
      PROFILE_LINK_EDITOR_FIELDS.filter(
        (field) =>
          editingKey !== field.key &&
          isProfileLinkEditorPreviewable(links[field.key], field.kind)
      ),
    [editingKey, links]
  );

  const visibleInputFields = useMemo(
    () =>
      PROFILE_LINK_EDITOR_FIELDS.filter((field) => {
        if (fieldErrors[field.key]) {
          return true;
        }

        if (editingKey === field.key) {
          return true;
        }

        const value = links[field.key];
        if (!value.trim()) {
          return false;
        }

        return !isProfileLinkEditorPreviewable(value, field.kind);
      }),
    [editingKey, fieldErrors, links]
  );

  const availableToAdd = useMemo(
    () =>
      PROFILE_LINK_EDITOR_FIELDS.filter(
        (field) => !links[field.key].trim() && editingKey !== field.key
      ),
    [editingKey, links]
  );

  const focusField = (key: keyof ProfileLinksInput) => {
    requestAnimationFrame(() => {
      inputRefs.current[key]?.focus();
    });
  };

  const rememberBaseline = (key: keyof ProfileLinksInput) => {
    editBaselineRef.current[key] = links[key];
    noteBaselineRef.current[key] = notes?.[key] ?? '';
  };

  const clearBaseline = (key: keyof ProfileLinksInput) => {
    delete editBaselineRef.current[key];
    delete noteBaselineRef.current[key];
  };

  const startEdit = (key: keyof ProfileLinksInput) => {
    rememberBaseline(key);
    setEditingKey(key);
    setPickerOpen(false);
    focusField(key);
  };

  const startAdd = (key: keyof ProfileLinksInput) => {
    rememberBaseline(key);
    setEditingKey(key);
    setPickerOpen(false);
    focusField(key);
  };

  const handleCancel = (key: keyof ProfileLinksInput) => {
    const baseline = editBaselineRef.current[key] ?? '';
    onUpdateLink(key, baseline);
    onUpdateNote?.(key, noteBaselineRef.current[key] ?? '');
    onClearFieldError(key);
    clearBaseline(key);
    setEditingKey(null);
  };

  const handleCommit = (key: keyof ProfileLinksInput, kind: ProfileLinkKind) => {
    const result = formatProfileLinkForEditor(links[key], kind);

    if (result.error) {
      onSetFieldError(key, result.error);
      return;
    }

    onClearFieldError(key);
    if (result.value !== links[key]) {
      onUpdateLink(key, result.value);
    }
    if (!result.value.trim()) {
      onUpdateNote?.(key, '');
    }

    clearBaseline(key);
    if (editingKey === key) {
      setEditingKey(null);
    }
  };

  return (
    <section className="account-editor-section account-editor-links-section">
      <h3 className="sr-only">Links</h3>

      {previewFields.length > 0 ? (
        <div className="portfolio-links-scroll account-editor-links-scroll">
          <ul className="portfolio-links account-editor-links-preview">
            {previewFields.map((field) => (
              <li key={field.key}>
                <button
                  type="button"
                  className="portfolio-link account-editor-link-chip"
                  aria-label={`Edit ${notes?.[field.key]?.trim() || field.label}`}
                  onClick={() => startEdit(field.key)}
                >
                  <PortfolioLinkIcon
                    kind={field.kind}
                    className="portfolio-link-icon"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {visibleInputFields.length > 0 ? (
        <div className="account-editor-link-grid">
          {visibleInputFields.map((field) => (
            <ProfileLinkInputRow
              key={field.key}
              field={field}
              value={links[field.key]}
              note={notes?.[field.key] ?? ''}
              error={fieldErrors[field.key]}
              inputRef={(node) => {
                inputRefs.current[field.key] = node;
              }}
              onChange={(value) => {
                onUpdateLink(field.key, value);
                if (fieldErrors[field.key]) {
                  onClearFieldError(field.key);
                }
              }}
              onNoteChange={
                onUpdateNote
                  ? (value) => onUpdateNote(field.key, value)
                  : undefined
              }
              onCommit={() => handleCommit(field.key, field.kind)}
              onCancel={() => handleCancel(field.key)}
            />
          ))}
        </div>
      ) : null}

      {availableToAdd.length > 0 ? (
        <div className="account-editor-links-actions">
          <button
            type="button"
            className={`account-editor-links-add${pickerOpen ? ' is-open' : ''}`}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((current) => !current)}
          >
            Add link
          </button>

          {pickerOpen ? (
            <ul className="account-editor-links-picker">
              {availableToAdd.map((field) => (
                <li key={field.key}>
                  <button
                    type="button"
                    className="account-editor-links-picker-option"
                    onClick={() => startAdd(field.key)}
                  >
                    <PortfolioLinkIcon
                      kind={field.kind}
                      className="portfolio-link-icon account-editor-links-picker-icon"
                    />
                    <span>{field.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
