'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import {
  parseProfileEditorTagDraft,
  PROFILE_EDITOR_MAX_TAGS,
  removeProfileEditorTag,
  tryAddProfileEditorTag,
  type ProfileEditorTagCommitHint,
} from '@/lib/profile-tag-editor';

interface ProfileTagsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function ProfileTagsEditor({ tags, onChange }: ProfileTagsEditorProps) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<ProfileEditorTagCommitHint | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const atMax = tags.length >= PROFILE_EDITOR_MAX_TAGS;

  const commitDraft = (value: string) => {
    const parsed = parseProfileEditorTagDraft(value);
    if (parsed.length === 0) {
      setDraft('');
      setHint(null);
      return;
    }

    let next = tags;
    let nextHint: ProfileEditorTagCommitHint | null = null;

    for (const tag of parsed) {
      const result = tryAddProfileEditorTag(next, tag);
      next = result.tags;
      if (result.hint && !nextHint) {
        nextHint = result.hint;
      }
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

    if (event.key === 'Backspace' && draft.length === 0 && tags.length > 0) {
      onChange(tags.slice(0, -1));
      setHint(null);
    }
  };

  const focusInput = () => {
    if (!atMax) {
      inputRef.current?.focus();
    }
  };

  return (
    <section className="account-editor-section account-editor-tags-section">
      <h3 className="sr-only">Tags</h3>
      <ul
        className={`portfolio-tags account-editor-tags${atMax ? ' is-full' : ''}`}
        onClick={focusInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            focusInput();
          }
        }}
        role="presentation"
      >
        {tags.map((tag) => (
          <li key={tag} className="portfolio-tag account-editor-tag">
            {tag}
            <button
              type="button"
              className="account-editor-tag-remove"
              aria-label={`Remove ${tag}`}
              onClick={(event) => {
                event.stopPropagation();
                onChange(removeProfileEditorTag(tags, tag));
                setHint(null);
              }}
            >
              <MultiplyIcon aria-hidden className="account-editor-tag-remove-icon" />
            </button>
          </li>
        ))}

        {!atMax ? (
          <li className="portfolio-tag account-editor-tag account-editor-tag--draft">
            <input
              ref={inputRef}
              className="account-editor-tags-input"
              value={draft}
              placeholder={tags.length === 0 ? 'Add tags…' : 'Add tag…'}
              aria-label="Add tag"
              maxLength={PROFILE_EDITOR_MAX_TAGS * 32}
              onFocus={scrollFieldIntoView}
              onChange={(event) => {
                const value = event.target.value;
                if (hint) {
                  setHint(null);
                }
                if (value.includes(',')) {
                  commitDraft(value);
                  return;
                }
                setDraft(value);
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (draft.trim()) {
                  commitDraft(draft);
                }
              }}
              onClick={(event) => event.stopPropagation()}
            />
          </li>
        ) : null}
      </ul>
      <p className="account-editor-section-meta">
        {hint ? (
          <span className="account-editor-tag-hint" role="alert">
            {hint}
          </span>
        ) : (
          <span>
            {tags.length}/{PROFILE_EDITOR_MAX_TAGS}
          </span>
        )}
      </p>
    </section>
  );
}
