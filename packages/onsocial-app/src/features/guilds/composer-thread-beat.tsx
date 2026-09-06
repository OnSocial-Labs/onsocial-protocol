'use client';

import type {
  FocusEvent,
  ReactNode,
  RefObject,
} from 'react';
import {
  PROFILE_ABOUT_ALIGN_OPTIONS,
  type PostRow,
  type ProfileKind,
} from '@onsocial/sdk';
import { OsFieldRemove, osFieldBorderedClassName } from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { QuotedPostInset } from '@/features/home/post-card';
import { PostMediaBlock } from '@/features/home/post-media';
import { ComposerHashtagTextarea } from '@/features/guilds/composer-hashtag-textarea';
import type { ComposerMode } from '@/features/guilds/guild-composer-sheet';
import type { MentionPriorityAccount } from '@/features/home/post-mention-suggestions';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { ARTICLE_TITLE_MAX } from '@/lib/article-post-payload';
import type { ComposerBeat } from '@/lib/composer-thread';
import { POST_TEXT_MAX_LENGTH } from '@/lib/post-display';
import { normalizePlaceSlug, placeLabel } from '@/lib/post-place';
import { postMediaRevokeLocalPreviewUrl } from '@/lib/post-media';

export type ComposerSheetBeat = ComposerBeat & {
  id: string;
  previews: { url: string; mime: string }[];
};

export const COMPOSER_PLACEHOLDER: Record<ComposerMode, string> = {
  post: 'Share something…',
  reply: 'Post your reply',
  quote: 'Add a comment',
};

export const COMPOSER_POLL_PLACEHOLDER = 'Ask a question…';

export const COMPOSER_POLL_DURATION_OPTIONS = [
  { label: '1d', ms: 86_400_000 },
  { label: '3d', ms: 3 * 86_400_000 },
  { label: '1w', ms: 7 * 86_400_000 },
] as const;

export const COMPOSER_MIN_POLL_OPTIONS = 2;
export const COMPOSER_MAX_POLL_OPTIONS = 4;

export function ComposerThreadBeat({
  row,
  index,
  mode,
  target,
  targetAuthorProfile,
  muted,
  focused,
  pending,
  canComposeThread,
  beatCount,
  showDestinationMenus,
  identitySlot,
  accountId,
  viewerKind,
  viewerAvatarUrl,
  viewerName,
  textareaRef,
  mediaStripRef,
  placeInputRef,
  priorityMentionAccounts,
  onPatch,
  onRemove,
  onFocusBeat,
  onScrollField,
  onOpenLabels,
  onMediaError,
}: {
  row: ComposerSheetBeat;
  index: number;
  mode: ComposerMode;
  target?: PostRow | null;
  targetAuthorProfile?: PostAuthorProfile | null;
  muted: boolean;
  focused: boolean;
  pending: boolean;
  canComposeThread: boolean;
  beatCount: number;
  showDestinationMenus: boolean;
  identitySlot: ReactNode;
  accountId: string | null | undefined;
  viewerKind?: ProfileKind | null;
  viewerAvatarUrl?: string | null;
  viewerName: string;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  mediaStripRef?: RefObject<HTMLDivElement | null>;
  placeInputRef?: RefObject<HTMLInputElement | null>;
  priorityMentionAccounts?: MentionPriorityAccount[];
  onPatch: (patch: Partial<ComposerSheetBeat>) => void;
  onRemove?: () => void;
  onFocusBeat: () => void;
  onScrollField: (event: FocusEvent<HTMLElement>) => void;
  onOpenLabels: () => void;
  onMediaError: (message: string | null) => void;
}) {
  const rowTitle = row.articleTitle.trim();
  const rowCanArticle = mode === 'post' && !row.drop && !row.pollEnabled;
  const rowCanPoll = mode === 'post' && !row.drop && !rowTitle;
  const rowCanPlace = mode === 'post';
  const beatPlaceholder = row.pollEnabled
    ? COMPOSER_POLL_PLACEHOLDER
    : COMPOSER_PLACEHOLDER[mode];

  return (
    <div
      className={`guild-composer-self${
        index === 0 && showDestinationMenus ? ' has-destination-menus' : ''
      }${muted ? ' is-muted' : ''}${
        canComposeThread && index > 0 ? ' has-remove' : ''
      }`}
    >
      <AccountAvatar
        accountId={accountId}
        kind={viewerKind}
        src={viewerAvatarUrl ?? null}
        fallbackInitial={viewerName}
        size="lg"
        className="guild-composer-row-avatar"
      />
      <div className="guild-composer-row-copy">
        {index === 0 ? identitySlot : null}
        {canComposeThread && index > 0 ? (
          <div className="guild-composer-beat-remove">
            <OsFieldRemove
              aria-label={`Remove post ${index + 1}`}
              ready={!pending}
              disabled={pending}
              onClick={onRemove}
            />
          </div>
        ) : null}
        <div className="guild-composer-beat-body">
          {rowCanArticle ? (
            <label className="guild-composer-article-field">
              <span className="sr-only">Article title</span>
              <input
                type="text"
                className={`${osFieldBorderedClassName} guild-composer-article-title`}
                value={row.articleTitle}
                maxLength={ARTICLE_TITLE_MAX}
                disabled={pending}
                autoComplete="off"
                placeholder="Title (optional)"
                aria-label="Article title"
                onChange={(event) =>
                  onPatch({ articleTitle: event.target.value })
                }
                onFocus={(event) => {
                  onFocusBeat();
                  onScrollField(event);
                }}
              />
            </label>
          ) : null}
          {rowCanArticle && rowTitle ? (
            <div
              className="guild-composer-article-align"
              role="group"
              aria-label="Article alignment"
            >
              {PROFILE_ABOUT_ALIGN_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`account-editor-bio-tool profile-about-edit-align-tool${
                    row.articleAlign === option ? ' is-active' : ''
                  }`}
                  aria-label={
                    option === 'left'
                      ? 'Align left'
                      : option === 'center'
                        ? 'Align center'
                        : 'Justify'
                  }
                  aria-pressed={row.articleAlign === option}
                  disabled={pending}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onFocusBeat();
                    onPatch({ articleAlign: option });
                  }}
                >
                  {option === 'left' ? 'L' : option === 'center' ? 'C' : 'J'}
                </button>
              ))}
            </div>
          ) : null}
          <ComposerHashtagTextarea
            textareaRef={focused ? textareaRef : undefined}
            placeholder={beatPlaceholder}
            ariaLabel={
              canComposeThread && beatCount > 1
                ? `Post ${index + 1}`
                : beatPlaceholder
            }
            value={row.text}
            maxLength={POST_TEXT_MAX_LENGTH}
            disabled={pending}
            onChange={(value) => onPatch({ text: value })}
            onFocus={(event) => {
              onFocusBeat();
              onScrollField(event);
            }}
            priorityMentionAccounts={priorityMentionAccounts}
          />
          {row.previews.length > 0 ? (
            <div
              ref={focused ? mediaStripRef : undefined}
              className="guild-composer-media-preview"
              role="list"
              aria-label="Attached media"
            >
              {row.previews.map((preview, fileIndex) => (
                <div key={preview.url} role="listitem">
                  <PostMediaBlock
                    item={{ url: preview.url, mime: preview.mime }}
                    size="preview"
                    onRemove={
                      pending
                        ? undefined
                        : () => {
                            const removed = row.files[fileIndex];
                            if (removed) {
                              postMediaRevokeLocalPreviewUrl(removed);
                            }
                            onMediaError(null);
                            onPatch({
                              files: row.files.filter((_, i) => i !== fileIndex),
                              previews: row.previews.filter(
                                (_, i) => i !== fileIndex
                              ),
                            });
                          }
                    }
                  />
                </div>
              ))}
            </div>
          ) : null}
          {row.drop ? (
            <div
              className="guild-composer-media-preview"
              role="list"
              aria-label={`Attached Drop: ${row.drop.title}`}
            >
              <div role="listitem">
                {row.drop.mediaUrl ? (
                  <PostMediaBlock
                    item={{
                      url: row.drop.mediaUrl,
                      mime: 'image/*',
                    }}
                    size="preview"
                    onRemove={
                      pending ? undefined : () => onPatch({ drop: null })
                    }
                  />
                ) : (
                  <div className="post-media-tile post-media-tile--preview guild-composer-drop-fallback-tile">
                    <span className="guild-composer-drop-preview-fallback" />
                    {!pending ? (
                      <button
                        type="button"
                        className="post-media-remove"
                        aria-label="Remove Drop"
                        onClick={() => onPatch({ drop: null })}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          {rowCanPoll && row.pollEnabled ? (
            <div className="guild-composer-poll">
              <div className="guild-composer-poll-options">
                {row.pollOptions.map((option, optionIndex) => (
                  <div
                    key={`poll-option-${optionIndex}`}
                    className="guild-composer-poll-row"
                  >
                    <input
                      className={`${osFieldBorderedClassName} guild-composer-poll-input`}
                      value={option}
                      maxLength={48}
                      disabled={pending}
                      placeholder={`Option ${optionIndex + 1}`}
                      aria-label={`Poll option ${optionIndex + 1}`}
                      onChange={(event) =>
                        onPatch({
                          pollOptions: row.pollOptions.map((value, i) =>
                            i === optionIndex ? event.target.value : value
                          ),
                        })
                      }
                      onFocus={(event) => {
                        onFocusBeat();
                        onScrollField(event);
                      }}
                    />
                    {row.pollOptions.length > COMPOSER_MIN_POLL_OPTIONS ? (
                      <OsFieldRemove
                        aria-label={`Remove option ${optionIndex + 1}`}
                        ready={!pending}
                        disabled={pending}
                        onClick={() => {
                          if (row.pollOptions.length <= COMPOSER_MIN_POLL_OPTIONS) {
                            return;
                          }
                          onPatch({
                            pollOptions: row.pollOptions.filter(
                              (_, i) => i !== optionIndex
                            ),
                          });
                        }}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
              {row.pollOptions.length < COMPOSER_MAX_POLL_OPTIONS ? (
                <button
                  type="button"
                  className="guild-composer-poll-add"
                  disabled={pending}
                  onClick={() => {
                    if (row.pollOptions.length >= COMPOSER_MAX_POLL_OPTIONS) {
                      return;
                    }
                    onFocusBeat();
                    onPatch({
                      pollOptions: [...row.pollOptions, ''],
                    });
                  }}
                >
                  Add option
                </button>
              ) : null}
              <div
                className="guild-composer-poll-duration"
                role="group"
                aria-label="Poll duration"
              >
                <button
                  type="button"
                  className={
                    row.pollDurationMs == null
                      ? 'guild-composer-poll-chip is-active'
                      : 'guild-composer-poll-chip'
                  }
                  disabled={pending}
                  onClick={() => onPatch({ pollDurationMs: undefined })}
                >
                  Open
                </button>
                {COMPOSER_POLL_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={
                      row.pollDurationMs === option.ms
                        ? 'guild-composer-poll-chip is-active'
                        : 'guild-composer-poll-chip'
                    }
                    disabled={pending}
                    onClick={() => onPatch({ pollDurationMs: option.ms })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {mode === 'quote' && target ? (
            <QuotedPostInset
              post={target}
              authorProfile={targetAuthorProfile ?? undefined}
            />
          ) : null}
          {row.contentWarning.trim() || row.nsfw ? (
            <div
              className="guild-composer-label-chips"
              role="group"
              aria-label="Content labels"
            >
              {row.contentWarning.trim() ? (
                <button
                  type="button"
                  className="guild-composer-label-chip"
                  disabled={pending}
                  onClick={() => {
                    onFocusBeat();
                    onOpenLabels();
                  }}
                >
                  CW · {row.contentWarning.trim()}
                </button>
              ) : null}
              {row.nsfw ? (
                <button
                  type="button"
                  className="guild-composer-label-chip is-nsfw"
                  disabled={pending}
                  onClick={() => {
                    onFocusBeat();
                    onOpenLabels();
                  }}
                >
                  NSFW
                </button>
              ) : null}
            </div>
          ) : null}
          {rowCanPlace && row.placeOpen ? (
            <label className="guild-composer-place-field">
              <span className="sr-only">Place</span>
              <input
                ref={focused ? placeInputRef : undefined}
                type="text"
                className={`${osFieldBorderedClassName} guild-composer-place-input`}
                value={row.placeDraft}
                disabled={pending}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
                placeholder="Lisbon, ETH Denver…"
                aria-label="Place"
                onChange={(event) =>
                  onPatch({ placeDraft: event.target.value })
                }
                onFocus={(event) => {
                  onFocusBeat();
                  onScrollField(event);
                }}
              />
              {normalizePlaceSlug(row.placeDraft) ? (
                <span className="guild-composer-place-hint" aria-hidden>
                  {placeLabel(normalizePlaceSlug(row.placeDraft)!)}
                </span>
              ) : null}
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
