'use client';

/**
 * Token bio field — textarea + portfolio-style # / $ / @ / url mirror.
 * `@` opens OnSocial profile suggestions (people, orgs, DAOs).
 * Incomplete @queries stay in the text but lose chip color so you can correct.
 * Only complete named accounts (`.near` / `.testnet` / `.tg`) get the mention chip.
 *
 * `layout="face"` — centered short page bio.
 * `layout="about"` — full-width More for About.
 */

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
import { Divider } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { OsAutolinkChip } from '@/features/home/os-autolink-chip';
import {
  findActiveMentionQuery,
  insertMentionAt,
  isCompleteMentionAccountId,
  type ActiveMentionQuery,
} from '@/features/home/post-mentions';
import {
  loadMentionSuggestions,
  MENTION_SUGGEST_LIMIT,
} from '@/features/home/post-mention-suggestions';
import { splitComposerRichText } from '@/features/home/post-rich-segments';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { FACE_BIO_WRAP_CHARS } from '@/lib/profile-bio-face';
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

function clampToMax(text: string, maxLength?: number): string {
  if (maxLength == null || text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

export function ProfileFaceBioField({
  value,
  onChange,
  onFocus,
  onBlur,
  id,
  placeholder = 'Bio',
  maxLength = FACE_BIO_WRAP_CHARS,
  rows = 2,
  layout = 'face',
  textareaRef,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLTextAreaElement>;
  id?: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  /** Face = centered page bio; about = full-width More for About. */
  layout?: 'face' | 'about';
  textareaRef?: Ref<HTMLTextAreaElement>;
  disabled?: boolean;
}) {
  const { accountId: viewerAccountId } = useAppWallet();
  const localRef = useRef<HTMLTextAreaElement>(null);
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
    if (!el) return;
    el.style.height = 'auto';
    el.style.overflowY = 'hidden';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    if (mentionQuery === null || disabled) {
      queueMicrotask(() => setSuggestions([]));
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
            viewerAccountId
          );
          if (!cancelled) {
            setSuggestions(matches.slice(0, MENTION_SUGGEST_LIMIT));
            setActiveIndex(0);
          }
        } catch {
          if (!cancelled) setSuggestions([]);
        }
      })();
    }, MENTION_SUGGEST_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [disabled, mentionQuery, viewerAccountId]);

  const showSuggestions =
    Boolean(activeMention) && focused && !disabled && suggestions.length > 0;

  useEffect(() => {
    if (!showSuggestions) return;
    suggestRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [showSuggestions, suggestions.length]);

  const commitValue = (next: string, nextCaret?: number) => {
    const text = clampToMax(next, maxLength);
    onChange(text);
    if (nextCaret != null) {
      const caretPos = Math.min(nextCaret, text.length);
      window.requestAnimationFrame(() => {
        const el = localRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caretPos, caretPos);
        setCaret(caretPos);
      });
    }
  };

  const applyMention = (accountId: string, active: ActiveMentionQuery) => {
    const next = insertMentionAt(value, active, accountId);
    setSuggestions([]);
    commitValue(clampToMax(next.text, maxLength), next.caret);
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
    <div
      className="account-editor-bio-shell"
      data-chrome="false"
      data-layout={layout}
    >
      <div className="account-editor-bio-field">
        <div className="account-editor-bio-backdrop" aria-hidden>
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
              // Incomplete / in-progress @query: keep text, lose chip color.
              if (!isCompleteMentionAccountId(segment.accountId)) {
                return <span key={`m-${index}`}>{segment.value}</span>;
              }
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
                  text={segment.value}
                  variant="mirror"
                />
              );
            }
            return <span key={`t-${index}`}>{segment.value}</span>;
          })}
          {value.endsWith('\n') ? '\n' : null}
        </div>
        <textarea
          ref={mergeRefs(localRef, textareaRef)}
          id={id}
          className="account-editor-bio is-rich-overlay"
          rows={rows}
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(event) => {
            onChange(clampToMax(event.target.value, maxLength));
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
          onBlur={(event) => {
            setFocused(false);
            setSuggestions([]);
            onBlur?.(event);
          }}
        />
      </div>
      {showSuggestions && activeMention ? (
        <div ref={suggestRef} className="composer-mention-suggest">
          <Divider variant="item" className="composer-mention-suggest-divider" />
          <div
            className="standing-list composer-mention-suggest-list"
            role="listbox"
            aria-label="Mention profiles"
          >
            {suggestions.map((item, index) => {
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
                    <StandingIdentity
                      accountId={item.accountId}
                      profileName={item.name}
                      avatarUrl={avatarUrl}
                      size="md"
                    />
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
