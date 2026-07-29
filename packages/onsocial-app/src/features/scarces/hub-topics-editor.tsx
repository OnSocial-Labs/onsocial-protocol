'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { MultiplyIcon } from '@onsocial/ui';
import {
  HUB_MAX_TOPICS,
  HUB_TOPIC_SUGGESTIONS,
  hubCategoryLabel,
} from '@/features/scarces/hub-categories';
import {
  normalizeTopicList,
  normalizeTopicSlug,
  TOPIC_MAX_LENGTH,
} from '@/lib/topic-slug';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';

type CommitHint = 'Already added' | 'Max 2 topics';

function tryAddTopic(
  topics: string[],
  draft: string
): { topics: string[]; hint: CommitHint | null } {
  const slug = normalizeTopicSlug(draft);
  if (!slug) return { topics, hint: null };
  const current = normalizeTopicList(topics, HUB_MAX_TOPICS);
  if (current.length >= HUB_MAX_TOPICS) {
    return { topics: current, hint: 'Max 2 topics' };
  }
  if (current.includes(slug)) {
    return { topics: current, hint: 'Already added' };
  }
  return {
    topics: normalizeTopicList([...current, slug], HUB_MAX_TOPICS),
    hint: null,
  };
}

function removeTopic(topics: string[], topic: string): string[] {
  const slug = normalizeTopicSlug(topic);
  return normalizeTopicList(
    topics.filter((item) => item !== slug),
    HUB_MAX_TOPICS
  );
}

interface HubTopicsEditorProps {
  topics: string[];
  onChange: (topics: string[]) => void;
  id?: string;
  disabled?: boolean;
}

/** Primary + optional secondary hub topics (primary = category). */
export function HubTopicsEditor({
  topics,
  onChange,
  id,
  disabled = false,
}: HubTopicsEditorProps) {
  const [draft, setDraft] = useState('');
  const [hint, setHint] = useState<CommitHint | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const atMax = topics.length >= HUB_MAX_TOPICS;

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

    let next = topics;
    let nextHint: CommitHint | null = null;
    for (const part of parts) {
      const result = tryAddTopic(next, part);
      next = result.topics;
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
    if (event.key === 'Backspace' && draft.length === 0 && topics.length > 0) {
      onChange(topics.slice(0, -1));
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
    if (topics.includes(idSlug)) {
      onChange(removeTopic(topics, idSlug));
      setHint(null);
      return;
    }
    const result = tryAddTopic(topics, idSlug);
    onChange(result.topics);
    setHint(result.hint);
  };

  return (
    <div className="guild-tags-editor hub-topics-editor">
      <div
        className="app-storage-presets"
        role="group"
        aria-label="Suggested categories"
      >
        {HUB_TOPIC_SUGGESTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`os-surface-chip${
              topics.includes(option.id) ? ' is-selected' : ''
            }`}
            disabled={disabled || (!topics.includes(option.id) && atMax)}
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
        {topics.map((topic, index) => (
          <li
            key={topic}
            className={`portfolio-tag account-editor-tag${
              index === 0 ? ' guild-tags-editor-tag--primary' : ''
            }`}
          >
            {hubCategoryLabel(topic) ?? topic}
            {index === 0 ? (
              <span className="guild-tags-editor-primary-label">Category</span>
            ) : null}
            <button
              type="button"
              className="account-editor-tag-remove"
              aria-label={`Remove ${topic}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                onChange(removeTopic(topics, topic));
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
          <li className="portfolio-tag account-editor-tag account-editor-tag--draft">
            <input
              ref={inputRef}
              className="account-editor-tags-input"
              value={draft}
              disabled={disabled}
              placeholder={
                topics.length === 0 ? 'Add category…' : 'Add topic…'
              }
              aria-label={
                topics.length === 0 ? 'Hub category' : 'Secondary hub topic'
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
            {topics.length}/{HUB_MAX_TOPICS}
            {topics.length === 0
              ? ' — first is the category for browse'
              : topics.length === 1
                ? ' — add one more or leave as category'
                : ' — first is the category for browse'}
          </span>
        )}
      </small>
    </div>
  );
}
