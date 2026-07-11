'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { PostRow } from '@onsocial/sdk';
import {
  CameraIcon,
  Divider,
  GlassSheet,
  ProfileAvatar,
  SheetCloseButton,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { QuotedPostInset } from '@/features/home/post-card';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import {
  scrollMobileFieldIntoView,
  useMobileFieldFocusScroll,
} from '@/hooks/use-mobile-field-focus-scroll';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import { parsePostText } from '@/lib/post-display';
import { displayName, fallbackLabel } from '@/lib/profile-display';

export type GuildComposerMode = 'post' | 'reply' | 'quote';

export interface GuildComposerPollDraft {
  options: string[];
  /** Duration from now in ms; omit for open-ended. */
  durationMs?: number;
}

export interface GuildComposerSubmit {
  text: string;
  poll?: GuildComposerPollDraft;
}

const PLACEHOLDER: Record<GuildComposerMode, string> = {
  post: 'Share something…',
  reply: 'Post your reply',
  quote: 'Add a comment',
};

const POLL_PLACEHOLDER = 'Ask a question…';

const TITLE: Record<GuildComposerMode, string> = {
  post: 'New post',
  reply: 'Respond',
  quote: 'Respond',
};

const POLL_DURATION_OPTIONS = [
  { label: '1d', ms: 86_400_000 },
  { label: '3d', ms: 3 * 86_400_000 },
  { label: '1w', ms: 7 * 86_400_000 },
] as const;

const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 4;

/** Compact poll glyph — three bars (no Mage poll icon yet). */
function PollComposeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1.15rem"
      height="1.15rem"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 19V11M12 19V5M18 19v-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Where a new post lands — guild plus channel, later a personal feed. */
export interface GuildComposerDestination {
  name: string;
  channels: { id: string; title: string }[];
  selectedChannelId: string;
  onChannelChange: (channelId: string) => void;
}

interface GuildComposerSheetProps {
  open: boolean;
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
  onSubmit: (payload: GuildComposerSubmit) => void;
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

function normalizePollOptions(options: string[]): string[] {
  return options.map((option) => option.trim()).filter(Boolean);
}

/**
 * WYSIWYG composer in a bottom GlassSheet. Polls attach as an inline card on
 * new posts only; replies/quotes stay text.
 */
export function GuildComposerSheet({
  open,
  mode,
  target,
  targetAuthorProfile,
  onModeChange,
  destination,
  pending,
  error,
  onClose,
  onSubmit,
}: GuildComposerSheetProps) {
  const titleId = useId();
  const formId = useId();
  const { accountId } = useAppWallet();
  const viewerShell = useViewerProfileShellContext();
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const [text, setText] = useState('');
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDurationMs, setPollDurationMs] = useState<number | undefined>();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [formKey, setFormKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetOpen = open && !closing;
  const viewport = useVisualViewportSheetMetrics(sheetOpen);
  const canUsePoll = mode === 'post';

  const viewerName = accountId
    ? displayName(accountId, viewerShell?.displayName)
    : 'You';

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormKey((key) => key + 1);
      setText('');
      setPollEnabled(false);
      setPollOptions(['', '']);
      setPollDurationMs(undefined);
      setClosing(false);
    }
  }

  useScrollLock(open || closing);

  useEffect(() => {
    if (!sheetOpen) return;
    const focusTimer = window.setTimeout(() => {
      const field = textareaRef.current;
      if (!field) return;
      field.focus();
      scrollMobileFieldIntoView(field);
    }, 280);
    return () => window.clearTimeout(focusTimer);
  }, [sheetOpen, mode, formKey]);

  const requestClose = useCallback(() => {
    if (pending) return;
    setClosing(true);
  }, [pending]);

  const handleSheetClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const filledPollOptions = normalizePollOptions(pollOptions);
  const pollReady =
    !pollEnabled ||
    (filledPollOptions.length >= MIN_POLL_OPTIONS &&
      filledPollOptions.length === new Set(filledPollOptions).size);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || pending || !pollReady) return;
    onSubmit({
      text: trimmed,
      ...(canUsePoll && pollEnabled
        ? {
            poll: {
              options: filledPollOptions,
              ...(pollDurationMs != null ? { durationMs: pollDurationMs } : {}),
            },
          }
        : {}),
    });
  };

  const panelStyle = useMemo((): CSSProperties | undefined => {
    if (!viewport.isMobile || viewport.height <= 0) return undefined;
    const height = Math.min(viewport.height, 720);
    return {
      height: `${height}px`,
      maxHeight: `${height}px`,
      ...(viewport.lift > 0
        ? {
            marginBottom: `calc(${viewport.lift}px - env(safe-area-inset-bottom, 0px))`,
          }
        : null),
    };
  }, [viewport.height, viewport.isMobile, viewport.lift]);

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option
      )
    );
  };

  const addPollOption = () => {
    setPollOptions((current) =>
      current.length >= MAX_POLL_OPTIONS ? current : [...current, '']
    );
  };

  const removePollOption = (index: number) => {
    setPollOptions((current) => {
      if (current.length <= MIN_POLL_OPTIONS) return current;
      return current.filter((_, optionIndex) => optionIndex !== index);
    });
  };

  const togglePoll = () => {
    if (!canUsePoll || pending) return;
    setPollEnabled((current) => {
      if (current) {
        setPollOptions(['', '']);
        setPollDurationMs(undefined);
        return false;
      }
      return true;
    });
  };

  const inputPlaceholder =
    canUsePoll && pollEnabled ? POLL_PLACEHOLDER : PLACEHOLDER[mode];

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
          rows={pollEnabled ? 2 : 4}
          placeholder={inputPlaceholder}
          aria-label={inputPlaceholder}
          value={text}
          disabled={pending}
          onChange={(event) => setText(event.target.value)}
          onFocus={scrollFieldIntoView}
        />
        {canUsePoll && pollEnabled ? (
          <div className="guild-composer-poll">
            <div className="guild-composer-poll-options">
              {pollOptions.map((option, index) => (
                <div key={`poll-option-${index}`} className="guild-composer-poll-row">
                  <input
                    className="guild-composer-poll-input"
                    value={option}
                    maxLength={48}
                    disabled={pending}
                    placeholder={`Option ${index + 1}`}
                    aria-label={`Poll option ${index + 1}`}
                    onChange={(event) =>
                      updatePollOption(index, event.target.value)
                    }
                    onFocus={scrollFieldIntoView}
                  />
                  {pollOptions.length > MIN_POLL_OPTIONS ? (
                    <button
                      type="button"
                      className="guild-composer-poll-remove"
                      disabled={pending}
                      aria-label={`Remove option ${index + 1}`}
                      onClick={() => removePollOption(index)}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            {pollOptions.length < MAX_POLL_OPTIONS ? (
              <button
                type="button"
                className="guild-composer-poll-add"
                disabled={pending}
                onClick={addPollOption}
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
                  pollDurationMs == null
                    ? 'guild-composer-poll-chip is-active'
                    : 'guild-composer-poll-chip'
                }
                disabled={pending}
                onClick={() => setPollDurationMs(undefined)}
              >
                Open
              </button>
              {POLL_DURATION_OPTIONS.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  className={
                    pollDurationMs === option.ms
                      ? 'guild-composer-poll-chip is-active'
                      : 'guild-composer-poll-chip'
                  }
                  disabled={pending}
                  onClick={() => setPollDurationMs(option.ms)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {mode === 'quote' && target ? (
          <QuotedPostInset post={target} authorProfile={targetAuthorProfile} />
        ) : null}
      </div>
    </div>
  );

  const canPost =
    Boolean(text.trim()) && !pending && pollReady;

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      initialDetent="full"
      zIndex={58}
      ariaLabelledBy={titleId}
      backdropLabel="Close composer"
      bodyClassName="guild-composer-sheet-body"
      panelClassName="guild-composer-sheet-panel"
      panelStyle={panelStyle}
      header={
        <>
          <div className="standing-sheet-header guild-composer-sheet-header">
            <div className="standing-sheet-subject-row">
              <div className="standing-sheet-subject">
                <div className="standing-sheet-subject-copy">
                  <h2 id={titleId} className="standing-sheet-subject-name">
                    {TITLE[mode]}
                  </h2>
                  {mode === 'post' && destination ? (
                    <p className="discover-sheet-subtitle guild-composer-destination-whisper">
                      {destination.channels.length === 1
                        ? `${destination.name} · ${destination.channels[0]!.title}`
                        : destination.name}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="standing-sheet-actions">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel="Close composer"
                />
              </div>
            </div>
            {mode === 'post' &&
            destination &&
            destination.channels.length > 1 ? (
              <div className="standing-sheet-toolbar-row">
                <div
                  className="guild-composer-mode"
                  role="radiogroup"
                  aria-label="Room"
                >
                  {destination.channels.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      role="radio"
                      aria-checked={
                        destination.selectedChannelId === channel.id
                      }
                      className={
                        destination.selectedChannelId === channel.id
                          ? 'is-active'
                          : undefined
                      }
                      disabled={pending}
                      onClick={() => destination.onChannelChange(channel.id)}
                    >
                      {channel.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : mode !== 'post' && onModeChange ? (
              <div className="standing-sheet-toolbar-row">
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
              </div>
            ) : null}
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
      footer={
        <div
          className={`guild-composer-sheet-footer${
            viewport.lift > 0 ? ' is-keyboard-open' : ''
          }`}
        >
          <div className="guild-composer-toolbar">
            <div
              className="guild-composer-toolbar-tools"
              role="group"
              aria-label="Add to post"
            >
              <button
                type="button"
                className="guild-composer-tool"
                disabled
                title="Media — soon"
                aria-label="Add media (soon)"
              >
                <CameraIcon className="guild-composer-tool-icon" />
              </button>
              <button
                type="button"
                className={`guild-composer-tool${
                  pollEnabled ? ' is-active' : ''
                }`}
                disabled={!canUsePoll || pending}
                title={
                  canUsePoll
                    ? pollEnabled
                      ? 'Remove poll'
                      : 'Add poll'
                    : 'Polls are for new posts'
                }
                aria-label={
                  canUsePoll
                    ? pollEnabled
                      ? 'Remove poll'
                      : 'Add poll'
                    : 'Polls are for new posts'
                }
                aria-pressed={pollEnabled}
                onClick={togglePoll}
              >
                <PollComposeIcon className="guild-composer-tool-icon" />
              </button>
            </div>
            <OsSheetActions
              layout="row-compact"
              tone="frosted-primary"
              borderless
              className="guild-composer-toolbar-post"
            >
              <OsSheetAction
                type="submit"
                form={formId}
                variant="primary"
                ready={canPost}
                pending={pending}
                pendingLabel="Posting…"
                disabled={!canPost}
              >
                Post
              </OsSheetAction>
            </OsSheetActions>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        key={formKey}
        className="guild-composer-sheet-form"
        onSubmit={handleSubmit}
      >
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
      </form>
    </GlassSheet>
  );
}
