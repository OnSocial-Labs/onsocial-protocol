'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEvent,
  type Ref,
} from 'react';
import type { ProfileSearchRow } from '@onsocial/sdk';
import { Divider, ProfileAvatar } from '@onsocial/ui';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  findActiveMentionQuery,
  insertMentionAt,
  type ActiveMentionQuery,
} from '@/features/home/post-mentions';
import {
  loadMentionSuggestions,
  MENTION_SUGGEST_LIMIT,
  type MentionPriorityAccount,
} from '@/features/home/post-mention-suggestions';
import { OsAutolinkChip } from '@/features/home/os-autolink-chip';
import { splitComposerRichText } from '@/features/home/post-rich-segments';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { normalizeProfileSearchQuery } from '@/lib/profile-account-search';
import { resolveProfileMediaUrl } from '@/lib/profile-display';

const MENTION_SUGGEST_DEBOUNCE_MS = 220;

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else ref.current = node;
    }
  };
}

export function ComposerHashtagTextarea({
  value,
  onChange,
  onFocus,
  placeholder,
  ariaLabel,
  maxLength,
  disabled,
  rows = 2,
  textareaRef,
  className = 'guild-composer-input',
  priorityMentionAccounts,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  placeholder: string;
  ariaLabel: string;
  maxLength?: number;
  disabled?: boolean;
  rows?: number;
  textareaRef?: Ref<HTMLTextAreaElement>;
  className?: string;
  /** Reply/quote author (and similar) pinned above standings / search. */
  priorityMentionAccounts?: MentionPriorityAccount[];
}) {
  const { accountId: viewerAccountId } = useAppWallet();
  const localRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const suggestRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<ProfileSearchRow[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMention = focused ? findActiveMentionQuery(value, caret) : null;
  const mentionQuery = activeMention
    ? normalizeProfileSearchQuery(activeMention.query)
    : null;
  const segments = splitComposerRichText(value, activeMention);

  useLayoutEffect(() => {
    const el = localRef.current;
    const backdrop = backdropRef.current;
    if (!el || !backdrop) return;
    backdrop.scrollTop = el.scrollTop;
  }, [value]);

  useEffect(() => {
    if (mentionQuery === null || disabled) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const client = createReadOnlyOnSocialClient();
          const matches = await loadMentionSuggestions(
            client,
            mentionQuery,
            viewerAccountId,
            priorityMentionAccounts
          );
          if (!cancelled) {
            setSuggestions(matches.slice(0, MENTION_SUGGEST_LIMIT));
            setActiveIndex(0);
          }
        } catch {
          if (!cancelled) {
            setSuggestions([]);
          }
        }
      })();
    }, MENTION_SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [disabled, mentionQuery, priorityMentionAccounts, viewerAccountId]);

  const showSuggestions =
    Boolean(activeMention) && focused && !disabled && suggestions.length > 0;

  useEffect(() => {
    if (!showSuggestions) return;
    // Grow into the drawer scroller — no nested mention scrollbar.
    suggestRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [showSuggestions, suggestions.length]);

  const applyMention = (accountId: string, active: ActiveMentionQuery) => {
    const next = insertMentionAt(value, active, accountId);
    onChange(next.text);
    setSuggestions([]);
    window.requestAnimationFrame(() => {
      const el = localRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
      setCaret(next.caret);
    });
  };

  const syncCaret = (el: HTMLTextAreaElement) => {
    setCaret(el.selectionStart ?? 0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeMention || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + suggestions.length) % suggestions.length
      );
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const selected = suggestions[activeIndex];
      if (!selected) return;
      event.preventDefault();
      applyMention(selected.accountId, activeMention);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setSuggestions([]);
    }
  };

  return (
    <div className="guild-composer-input-shell">
      <div className="guild-composer-input-field">
        <div
          ref={backdropRef}
          className="guild-composer-input-backdrop"
          aria-hidden
        >
          {segments.map((segment, index) => {
            if (segment.type === 'hashtag') {
              return (
                <span key={`h-${index}`} className="os-hashtag">
                  {segment.value}
                </span>
              );
            }
            if (segment.type === 'ticker') {
              return (
                <span key={`k-${index}`} className="os-ticker">
                  {segment.value}
                </span>
              );
            }
            if (segment.type === 'mention') {
              return (
                <span key={`m-${index}`} className="os-mention">
                  {segment.value}
                </span>
              );
            }
            if (segment.type === 'url') {
              return (
                <OsAutolinkChip
                  key={`u-${index}`}
                  href={segment.href}
                  variant="mirror"
                />
              );
            }
            return <span key={`t-${index}`}>{segment.value}</span>;
          })}
          {/* Keep trailing newline height in sync with textarea. */}
          {value.endsWith('\n') ? '\n' : null}
        </div>
        <textarea
          ref={mergeRefs(localRef, textareaRef)}
          className={`${className} is-hashtag-overlay`}
          rows={rows}
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
            syncCaret(event.currentTarget);
          }}
          onClick={(event) => syncCaret(event.currentTarget)}
          onKeyUp={(event) => syncCaret(event.currentTarget)}
          onSelect={(event) => syncCaret(event.currentTarget)}
          onKeyDown={onKeyDown}
          onFocus={(event) => {
            setFocused(true);
            syncCaret(event.currentTarget);
            onFocus?.(event);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setFocused(false);
              setSuggestions([]);
            }, 120);
          }}
          onScroll={(event) => {
            if (backdropRef.current) {
              backdropRef.current.scrollTop = event.currentTarget.scrollTop;
            }
          }}
        />
      </div>
      {showSuggestions && activeMention ? (
        <div ref={suggestRef} className="composer-mention-suggest">
          <Divider variant="item" className="composer-mention-suggest-divider" />
          <div
            className="standing-list composer-mention-suggest-list"
            role="listbox"
            aria-label="Mention suggestions"
          >
            {suggestions.map((item, index) => {
              const displayName = item.name?.trim() || item.accountId;
              const avatarUrl = resolveProfileMediaUrl(item.avatar);
              return (
                <button
                  key={item.accountId}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className="standing-row composer-mention-suggest-row"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => applyMention(item.accountId, activeMention)}
                >
                  <span className="standing-row-main">
                    <ProfileAvatar
                      src={avatarUrl}
                      fallbackInitial={displayName}
                      size="md"
                      className="standing-row-avatar-slot"
                    />
                    <span className="standing-row-copy">
                      <span className="standing-row-head">
                        <span className="standing-row-name-row">
                          <span className="standing-row-name">{displayName}</span>
                        </span>
                        <span className="standing-row-handle">
                          @{item.accountId}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
