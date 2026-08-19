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

type CommitHint = 'Already set';

function setSoleCategory(
  draft: string
): { categories: string[]; hint: CommitHint | null } {
  const slug = normalizeTopicSlug(draft);
  if (!slug) return { categories: [], hint: null };
  return {
    categories: normalizeTopicList([slug], HUB_MAX_CATEGORIES),
    hint: null,
  };
}

interface HubCategoriesEditorProps {
  categories: string[];
  onChange: (categories: string[]) => void;
  id?: string;
  disabled?: boolean;
}

/**
 * Single hub category — curated chips + optional custom slug.
 * First (only) entry powers Discover browse.
 */
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
  const selected = categories[0] ?? null;
  const atMax = categories.length >= HUB_MAX_CATEGORIES;

  const commitDraft = (value: string) => {
    const slug = normalizeTopicSlug(value.trim());
    if (!slug) {
      setDraft('');
      setHint(null);
      return;
    }
    if (selected === slug) {
      setDraft('');
      setHint('Already set');
      return;
    }
    const result = setSoleCategory(slug);
    onChange(result.categories);
    setDraft('');
    setHint(null);
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
      onChange([]);
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
    if (selected === idSlug) {
      onChange([]);
      setHint(null);
      return;
    }
    onChange(normalizeTopicList([idSlug], HUB_MAX_CATEGORIES));
    setHint(null);
  };

  return (
    <div className="guild-tags-editor hub-categories-editor">
      <div
        className="app-storage-presets"
        role="radiogroup"
        aria-label="Suggested categories"
      >
        {HUB_CATEGORY_SUGGESTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected === option.id}
            className={`os-surface-chip${
              selected === option.id ? ' is-selected' : ''
            }`}
            disabled={disabled}
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
        {selected ? (
          <li className="portfolio-tag account-editor-tag">
            {hubCategoryLabel(selected) ?? selected}
            <button
              type="button"
              className="account-editor-tag-remove"
              aria-label={`Remove ${selected}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onChange([]);
                setHint(null);
              }}
            >
              <MultiplyIcon
                aria-hidden
                className="account-editor-tag-remove-icon"
              />
            </button>
          </li>
        ) : null}

        {!atMax ? (
          <li className="guild-tags-editor-draft">
            <input
              ref={inputRef}
              className="account-editor-tags-input"
              value={draft}
              disabled={disabled}
              placeholder="Or type a category…"
              aria-label="Hub category"
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
          <span>Pick one — powers Discover browse</span>
        )}
      </small>
    </div>
  );
}
