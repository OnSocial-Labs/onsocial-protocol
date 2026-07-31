'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import { GUILD_MAX_TOPICS } from '@/features/guilds/guild-config';
import {
  GUILD_EDITOR_MAX_TAG_LENGTH,
  parseGuildEditorTagDraft,
  removeGuildEditorTag,
  tryAddGuildEditorTag,
  type GuildEditorTagCommitHint,
} from '@/features/guilds/guild-tag-editor';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';

interface GuildTagsEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  disabled?: boolean;
}

export function GuildTagsEditor({
  tags,
  onChange,
  id,
  disabled = false,
}: GuildTagsEditorProps) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<GuildEditorTagCommitHint | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const atMax = tags.length >= GUILD_MAX_TOPICS;

  const commitDraft = (value: string) => {
    if (disabled) return;
    const parsed = parseGuildEditorTagDraft(value);
    if (parsed.length === 0) {
      setDraft('');
      setHint(null);
      return;
    }

    let next = tags;
    let nextHint: GuildEditorTagCommitHint | null = null;

    for (const tag of parsed) {
      const result = tryAddGuildEditorTag(next, tag);
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

  const focusInput = () => {
    if (!atMax && !disabled) {
      inputRef.current?.focus();
    }
  };

  return (
    <div className="guild-tags-editor">
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
        {tags.map((tag, index) => (
          <li
            key={tag}
            className={`portfolio-tag account-editor-tag${
              index === 0 ? ' guild-tags-editor-tag--primary' : ''
            }`}
          >
            {tag}
            {index === 0 ? (
              <span className="guild-tags-editor-primary-label">Primary</span>
            ) : null}
            <button
              type="button"
              className="account-editor-tag-remove"
              aria-label={`Remove ${tag}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onChange(removeGuildEditorTag(tags, tag));
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
              placeholder="Add topic…"
              aria-label="Add guild topic"
              maxLength={GUILD_EDITOR_MAX_TAG_LENGTH}
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
            {tags.length}/{GUILD_MAX_TOPICS}
          </span>
        )}
      </small>
    </div>
  );
}
