'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
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

interface ProfileLinkInputRowProps {
  field: (typeof PROFILE_LINK_EDITOR_FIELDS)[number];
  value: string;
  error?: string;
  inputRef: (node: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function ProfileLinkInputRow({
  field,
  value,
  error,
  inputRef,
  onChange,
  onCommit,
  onCancel,
}: ProfileLinkInputRowProps) {
  const inlineError = error ? profileLinkEditorInlineError(field.kind) : null;
  const scrollFieldIntoView = useMobileFieldFocusScroll();

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
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
          onBlur={onCommit}
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
    </div>
  );
}

function profileLinksHasInput(links: ProfileLinksInput) {
  return PROFILE_LINK_EDITOR_FIELDS.some((field) => links[field.key].trim());
}

interface ProfileLinksEditorProps {
  links: ProfileLinksInput;
  fieldErrors: Partial<Record<keyof ProfileLinksInput, string>>;
  onUpdateLink: (key: keyof ProfileLinksInput, value: string) => void;
  onClearFieldError: (key: keyof ProfileLinksInput) => void;
  onSetFieldError: (key: keyof ProfileLinksInput, error: string | null) => void;
}

export function ProfileLinksEditor({
  links,
  fieldErrors,
  onUpdateLink,
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
  };

  const clearBaseline = (key: keyof ProfileLinksInput) => {
    delete editBaselineRef.current[key];
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
                  aria-label={`Edit ${field.label}`}
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
