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
import { useScrollLock } from '@/hooks/use-scroll-lock';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { parsePostText } from '@/lib/post-display';
import { displayName, fallbackLabel } from '@/lib/profile-display';

export type GuildComposerMode = 'reply' | 'quote';

const PLACEHOLDER: Record<GuildComposerMode, string> = {
  reply: 'Post your reply',
  quote: 'Add a comment',
};

interface GuildComposerModalProps {
  target: PostRow;
  targetAuthorProfile?: PostAuthorProfile;
  mode: GuildComposerMode;
  onModeChange: (mode: GuildComposerMode) => void;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (text: string) => void;
}

function IdentityLine({ name, handle }: { name: string; handle: string }) {
  return (
    <span className="guild-composer-identity">
      {name}
      <span className="guild-composer-identity-handle">@{handle}</span>
    </span>
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
        <IdentityLine name={name} handle={post.accountId} />
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
  target,
  targetAuthorProfile,
  mode,
  onModeChange,
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
        {mode === 'quote' ? (
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
        aria-label={mode === 'reply' ? 'Reply to post' : 'Quote post'}
        onSubmit={handleSubmit}
      >
        <div className="guild-composer-top">
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
          <SheetCloseButton onClick={onClose} ariaLabel="Close composer" />
        </div>

        {mode === 'reply' ? (
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
