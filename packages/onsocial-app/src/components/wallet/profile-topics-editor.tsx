'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { profileIdentityTopicLabel } from '@/lib/profile-identity-topics';
import {
  PROFILE_EDITOR_MAX_TAG_LENGTH,
  PROFILE_EDITOR_MAX_TAGS,
  parseProfileEditorTagDraft,
  removeProfileEditorTag,
  tryAddProfileEditorTag,
  type ProfileEditorTagCommitHint,
} from '@/lib/profile-tag-editor';
import { formatTopicDraftInput } from '@/lib/topic-slug';

interface ProfileTopicsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}

export function ProfileTopicsEditor({
  tags,
  onChange,
  disabled = false,
}: ProfileTopicsEditorProps) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<ProfileEditorTagCommitHint | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const atMax = tags.length >= PROFILE_EDITOR_MAX_TAGS;

  const commitDraft = (value: string) => {
    if (disabled) return;
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
    if (
      event.key === 'Backspace' &&
      draft.length === 0 &&
      tags.length > 0 &&
      !disabled
    ) {
      onChange(tags.slice(0, -1));
      setHint(null);
    }
  };

  return (
    <div className="account-editor-topics">
      <ul className="portfolio-topics account-editor-topics-list">
        {tags.map((slug, index) => (
          <li key={slug} className="portfolio-topics-item">
            {index > 0 ? (
              <span className="portfolio-topics-sep" aria-hidden>
                ·
              </span>
            ) : null}
            <span className="portfolio-topics-label">
              {profileIdentityTopicLabel(slug)}
            </span>
            <button
              type="button"
              className="account-editor-topic-remove"
              aria-label={`Remove ${profileIdentityTopicLabel(slug)}`}
              disabled={disabled}
              onClick={() => {
                onChange(removeProfileEditorTag(tags, slug));
                setHint(null);
              }}
            >
              <MultiplyIcon
                aria-hidden
                className="account-editor-topic-remove-icon"
              />
            </button>
          </li>
        ))}
        {!atMax ? (
          <li className="account-editor-topics-draft">
            <input
              ref={inputRef}
              className="account-editor-topics-input"
              value={draft}
              disabled={disabled}
              placeholder={tags.length === 0 ? 'Writing, design…' : 'Add'}
              aria-label="Add topic"
              maxLength={PROFILE_EDITOR_MAX_TAG_LENGTH}
              onFocus={scrollFieldIntoView}
              onChange={(event) => {
                const value = event.target.value;
                if (hint) setHint(null);
                if (value.includes(',')) {
                  commitDraft(value);
                  return;
                }
                setDraft(formatTopicDraftInput(value));
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                if (draft.trim()) commitDraft(draft);
              }}
            />
          </li>
        ) : null}
      </ul>
      {hint ? (
        <p className="account-editor-topics-hint" role="alert">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
