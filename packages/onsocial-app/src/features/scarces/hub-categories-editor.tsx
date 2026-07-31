'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import {
  HUB_CATEGORY_SUGGESTIONS,
  HUB_MAX_CATEGORIES,
  hubCategoryLabel,
} from '@/features/scarces/hub-categories';
import {
  normalizeTopicList,
  normalizeTopicSlug,
  TOPIC_MAX_LENGTH,
} from '@/lib/topic-slug';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';

type CommitHint = 'Already added' | 'Max 2 categories';

function tryAddCategory(
  categories: string[],
  draft: string
): { categories: string[]; hint: CommitHint | null } {
  const slug = normalizeTopicSlug(draft);
  if (!slug) return { categories, hint: null };
  const current = normalizeTopicList(categories, HUB_MAX_CATEGORIES);
  if (current.length >= HUB_MAX_CATEGORIES) {
    return { categories: current, hint: 'Max 2 categories' };
  }
  if (current.includes(slug)) {
    return { categories: current, hint: 'Already added' };
  }
  return {
    categories: normalizeTopicList([...current, slug], HUB_MAX_CATEGORIES),
    hint: null,
  };
}

function removeCategory(categories: string[], category: string): string[] {
  const slug = normalizeTopicSlug(category);
  return normalizeTopicList(
    categories.filter((item) => item !== slug),
    HUB_MAX_CATEGORIES
  );
}

interface HubCategoriesEditorProps {
  categories: string[];
  onChange: (categories: string[]) => void;
  id?: string;
  disabled?: boolean;
}

/** Primary + optional secondary hub categories (first = directory browse). */
export function HubCategoriesEditor({
  categories,
  onChange,
  id,
  disabled = false,
}: HubCategoriesEditorProps) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<CommitHint | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const atMax = categories.length >= HUB_MAX_CATEGORIES;

  const commitDraft = (value: string) => {
    const parts = value
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      setDraft('');
      setHint(null);
      return;
    }

    let next = categories;
    let nextHint: CommitHint | null = null;
    for (const part of parts) {
      const result = tryAddCategory(next, part);
      next = result.categories;
      if (result.hint && !nextHint) nextHint = result.hint;
    }
    onChange(next);
    setDraft('');
    setHint(nextHint);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft(draft);
      return;
    }
    if (
      event.key === 'Backspace' &&
      draft.length === 0 &&
      categories.length > 0
    ) {
      onChange(categories.slice(0, -1));
      setHint(null);
    }
  };

  const focusInput = () => {
    if (!atMax && !disabled) {
      inputRef.current?.focus();
    }
  };

  const toggleSuggestion = (idSlug: string) => {
    if (disabled) return;
    if (categories.includes(idSlug)) {
      onChange(removeCategory(categories, idSlug));
      setHint(null);
      return;
    }
    const result = tryAddCategory(categories, idSlug);
    onChange(result.categories);
    setHint(result.hint);
  };

  return (
    <div className="guild-tags-editor hub-categories-editor">
      <div
        className="app-storage-presets"
        role="group"
        aria-label="Suggested categories"
      >
        {HUB_CATEGORY_SUGGESTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`os-surface-chip${
              categories.includes(option.id) ? ' is-selected' : ''
            }`}
            disabled={
              disabled || (!categories.includes(option.id) && atMax)
            }
            onClick={() => toggleSuggestion(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <ul
        id={id}
        className={`portfolio-tags account-editor-tags guild-tags-editor-list${
          atMax ? ' is-full' : ''
        }`}
        onClick={focusInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            focusInput();
          }
        }}
        role="presentation"
      >
        {categories.map((category, index) => (
          <li
            key={category}
            className={`portfolio-tag account-editor-tag${
              index === 0 ? ' guild-tags-editor-tag--primary' : ''
            }`}
          >
            {hubCategoryLabel(category) ?? category}
            {index === 0 ? (
              <span className="guild-tags-editor-primary-label">Primary</span>
            ) : null}
            <button
              type="button"
              className="account-editor-tag-remove"
              aria-label={`Remove ${category}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onChange(removeCategory(categories, category));
                setHint(null);
              }}
            >
              <MultiplyIcon
                aria-hidden
                className="account-editor-tag-remove-icon"
              />
            </button>
          </li>
        ))}

        {!atMax ? (
          <li className="guild-tags-editor-draft">
            <input
              ref={inputRef}
              className="account-editor-tags-input"
              value={draft}
              disabled={disabled}
              placeholder="Add category…"
              aria-label={
                categories.length === 0
                  ? 'Primary hub category'
                  : 'Secondary hub category'
              }
              maxLength={TOPIC_MAX_LENGTH}
              onFocus={scrollFieldIntoView}
              onChange={(event) => {
                const value = event.target.value;
                if (hint) setHint(null);
                if (value.includes(',')) {
                  commitDraft(value);
                  return;
                }
                setDraft(value);
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (draft.trim()) commitDraft(draft);
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </li>
        ) : null}
      </ul>

      <small className="guild-tags-editor-meta">
        {hint ? (
          <span className="guild-tags-editor-hint" role="alert">
            {hint}
          </span>
        ) : (
          <span>
            {categories.length}/{HUB_MAX_CATEGORIES}
          </span>
        )}
      </small>
    </div>
  );
}
