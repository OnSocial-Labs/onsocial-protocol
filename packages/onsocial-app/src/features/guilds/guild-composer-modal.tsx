'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PostRow } from '@onsocial/sdk';
import { ProfileAvatar, SheetCloseButton } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
  osFloatingPanelClassName,
  osSheetFloatingPanelClassName,
} from '@/components/ui/os-sheet-primary-action';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { QuotedPostInset } from '@/features/home/post-card';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { parsePostText } from '@/lib/post-display';
import { displayName, fallbackLabel } from '@/lib/profile-display';

export type GuildComposerMode = 'post' | 'reply' | 'quote';

const PLACEHOLDER: Record<GuildComposerMode, string> = {
  post: 'Share something',
  reply: 'Post your reply',
  quote: 'Add a comment',
};

const ARIA_LABEL: Record<GuildComposerMode, string> = {
  post: 'New post',
  reply: 'Reply to post',
  quote: 'Quote post',
};

/** Where a new post lands — guild plus channel, later a personal feed. */
export interface GuildComposerDestination {
  name: string;
  channels: { id: string; title: string }[];
  selectedChannelId: string;
  onChannelChange: (channelId: string) => void;
}

interface GuildComposerModalProps {
  mode: GuildComposerMode;
  /** Post being replied to / quoted. Not used in `post` mode. */
  target?: PostRow | null;
  targetAuthorProfile?: PostAuthorProfile;
  onModeChange?: (mode: GuildComposerMode) => void;
  /** Destination picker for `post` mode. */
  destination?: GuildComposerDestination;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

function IdentityLine({
  name,
  handle,
  timestamp,
}: {
  name: string;
  handle: string;
  timestamp?: number | string;
}) {
  return (
    <PostIdentityMeta
      name={name}
      accountId={handle}
      timestamp={timestamp}
      className="guild-composer-identity"
    />
  );
}

/** The post being continued — rendered as it appears in the thread. */
function ReplyTargetPreview({
  post,
  authorProfile,
}: {
  post: PostRow;
  authorProfile?: PostAuthorProfile;
}) {
  const name =
    authorProfile?.displayName?.trim() || fallbackLabel(post.accountId);

  return (
    <div className="guild-composer-reply-target">
      <ProfileAvatar
        src={authorProfile?.avatarUrl ?? null}
        fallbackInitial={name}
        size="md"
        className="guild-composer-row-avatar"
      />
      <div className="guild-composer-row-copy">
        <IdentityLine
          name={name}
          handle={post.accountId}
          timestamp={post.blockTimestamp}
        />
        <p className="guild-composer-reply-text">
          {parsePostText(post.value) || '…'}
        </p>
      </div>
    </div>
  );
}

/**
 * WYSIWYG composer: the modal renders exactly what gets created. Replies show
 * the target above your own row, joined by the thread line; quotes show your
 * row wrapping the quoted inset — as both will render once posted.
 */
export function GuildComposerModal({
  mode,
  target,
  targetAuthorProfile,
  onModeChange,
  destination,
  pending,
  error,
  onClose,
  onSubmit,
}: GuildComposerModalProps) {
  const { accountId } = useAppWallet();
  const viewerShell = useViewerProfileShellContext();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const viewerName = accountId
    ? displayName(accountId, viewerShell?.displayName)
    : 'You';

  useScrollLock(true);

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    onSubmit(trimmed);
  };

  const selfRow = (
    <div className="guild-composer-self">
      <ProfileAvatar
        src={viewerShell?.avatarUrl ?? null}
        fallbackInitial={viewerName}
        size="md"
        className="guild-composer-row-avatar"
      />
      <div className="guild-composer-row-copy">
        {accountId ? (
          <IdentityLine name={viewerName} handle={accountId} />
        ) : null}
        <textarea
          ref={textareaRef}
          className="guild-composer-input"
          rows={3}
          placeholder={PLACEHOLDER[mode]}
          aria-label={PLACEHOLDER[mode]}
          value={text}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
        />
        {mode === 'quote' && target ? (
          <QuotedPostInset post={target} authorProfile={targetAuthorProfile} />
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="guild-composer-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <form
        className={`${osFloatingPanelClassName} ${osSheetFloatingPanelClassName} guild-composer-modal-card`}
        role="dialog"
        aria-modal
        aria-label={ARIA_LABEL[mode]}
        onSubmit={handleSubmit}
      >
        <div className="guild-composer-top">
          {mode === 'post' && destination ? (
            <label className="guild-composer-destination">
              <span className="guild-composer-destination-name">
                {destination.name}
              </span>
              <select
                aria-label="Channel"
                value={destination.selectedChannelId}
                disabled={pending}
                onChange={(event) =>
                  destination.onChannelChange(event.target.value)
                }
              >
                {destination.channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.title}
                  </option>
                ))}
              </select>
            </label>
          ) : mode !== 'post' && onModeChange ? (
            <div
              className="guild-composer-mode"
              role="radiogroup"
              aria-label="Composer mode"
            >
              {(['reply', 'quote'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={mode === option}
                  className={mode === option ? 'is-active' : undefined}
                  disabled={pending}
                  onClick={() => onModeChange(option)}
                >
                  {option === 'reply' ? 'Reply' : 'Quote'}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <SheetCloseButton onClick={onClose} ariaLabel="Close composer" />
        </div>

        {mode === 'reply' && target ? (
          <div className="guild-composer-reply-flow">
            <ReplyTargetPreview
              post={target}
              authorProfile={targetAuthorProfile}
            />
            {selfRow}
          </div>
        ) : (
          selfRow
        )}

        {error ? <p className="guild-form-error">{error}</p> : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction type="submit" disabled={pending || !text.trim()}>
            {pending ? 'Posting…' : 'Post'}
          </OsSheetAction>
        </OsSheetActions>
      </form>
    </div>
  );
}
