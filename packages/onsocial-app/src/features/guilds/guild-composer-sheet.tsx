'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { PostRow } from '@onsocial/sdk';
import {
  ChartVerticalFillIcon,
  ChartVerticalIcon,
  Divider,
  GlassSheet,
  ImageFillIcon,
  ImageIcon,
  ProfileAvatar,
  SheetCloseButton,
  StarsCFillIcon,
  StarsCIcon,
} from '@onsocial/ui';
import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@/components/ui/choice-drawer';
import {
  OsSheetAction,
  OsSheetActions,
} from '@/components/ui/os-sheet-primary-action';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { QuotedPostInset } from '@/features/home/post-card';
import { PostMediaBlock } from '@/features/home/post-media';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { PostRichText } from '@/features/home/post-rich-text';
import { ComposerHashtagTextarea } from '@/features/guilds/composer-hashtag-textarea';
import { ComposerDropPicker } from '@/features/guilds/composer-drop-picker';
import { scarceNestZIndex } from '@/features/scarces/scarce-overlay-z';
import {
  scrollMobileFieldIntoView,
  useMobileFieldFocusScroll,
} from '@/hooks/use-mobile-field-focus-scroll';
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  parsePostText,
  POST_TEXT_MAX_LENGTH,
  POST_TEXT_WARN_REMAINING,
} from '@/lib/post-display';
import { POST_MEDIA_MAX_FILES, validatePostMediaFile } from '@/lib/post-media';
import {
  normalizeComposerContentLabels,
  parsePostContentLabels,
} from '@/lib/post-content-labels';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { PostSensitiveGate } from '@/features/home/post-sensitive-gate';
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';

/** Composer GlassSheet z-index — nested choice drawers stack above. */
const COMPOSER_SHEET_Z = 58;
const COMPOSER_NEST_Z = scarceNestZIndex(COMPOSER_SHEET_Z);

export type ComposerMode = 'post' | 'reply' | 'quote';
/** @deprecated Prefer `ComposerMode`. */
export type GuildComposerMode = ComposerMode;

export interface ComposerPollDraft {
  options: string[];
  /** Duration from now in ms; omit for open-ended. */
  durationMs?: number;
}
/** @deprecated Prefer `ComposerPollDraft`. */
export type GuildComposerPollDraft = ComposerPollDraft;

/** Drop / resale reference attached to a post (“Post this Drop”). */
export interface ComposerDropDraft {
  /** Drop collection when announcing a primary mint or Drop edition. */
  collectionId?: string;
  /** Specific edition — required for non-collection (`s:`) resale announces. */
  tokenId?: string;
  title: string;
  mediaUrl?: string | null;
  mediumKind?: string | null;
  /** Original mint post path for See original on resale Buy/Bid. */
  sourcePostPath?: string | null;
}

export interface ComposerSubmit {
  text: string;
  poll?: ComposerPollDraft;
  drop?: ComposerDropDraft;
  /** Attached image/video files (uploaded by SDK on write). */
  files?: File[];
  /** Optional spoiler / content warning (PostV1 `contentWarning`). */
  contentWarning?: string;
  /** Hard NSFW flag (PostV1 `nsfw`). */
  nsfw?: boolean;
}
/** @deprecated Prefer `ComposerSubmit`. */
export type GuildComposerSubmit = ComposerSubmit;

const PLACEHOLDER: Record<ComposerMode, string> = {
  post: 'Share something…',
  reply: 'Post your reply',
  quote: 'Add a comment',
};

const POLL_PLACEHOLDER = 'Ask a question…';

const TITLE: Record<ComposerMode, string> = {
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

/** Where a new post lands — guild room or personal public feed. */
export type ComposerDestination =
  | {
      kind: 'guild';
      name: string;
      channels: { id: string; title: string }[];
      selectedChannelId: string;
      onChannelChange: (channelId: string) => void;
      /** Rooms still fetching — show Room chip as Loading…. */
      loading?: boolean;
    }
  | {
      kind: 'personal';
      /** Whisper under the title, e.g. `@alice.near · Public`. */
      label: string;
    };
/** @deprecated Prefer `ComposerDestination`. */
export type GuildComposerDestination = ComposerDestination;

interface ComposerSheetProps {
  open: boolean;
  mode: ComposerMode;
  /** Post being replied to / quoted. Not used in `post` mode. */
  target?: PostRow | null;
  targetAuthorProfile?: PostAuthorProfile;
  onModeChange?: (mode: ComposerMode) => void;
  /** Destination picker for `post` mode. */
  destination?: ComposerDestination;
  /**
   * Optional Public / Guild switcher for Drop compose (and similar
   * cross-surface posts). Rendered above room chips when present.
   */
  feedTargets?: {
    options: { id: string; label: string }[];
    selectedId: string;
    onChange: (id: string) => void;
  };
  /** Prefill a Drop reference chip (“Post this Drop”). */
  initialDrop?: ComposerDropDraft | null;
  /** Prefill caption when opening with a Drop. */
  initialText?: string;
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: ComposerSubmit) => void;
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
  const { safeMode } = useViewerSafeMode();
  const labels = parsePostContentLabels(post.value);
  const name =
    authorProfile?.displayName?.trim() || fallbackLabel(post.accountId);

  return (
    <div className="guild-composer-reply-target">
      <ProfileAvatar
        src={authorProfile?.avatarUrl ?? null}
        fallbackInitial={name}
        size="lg"
        className="guild-composer-row-avatar"
      />
      <div className="guild-composer-row-copy">
        <IdentityLine
          name={name}
          handle={post.accountId}
          timestamp={post.blockTimestamp}
        />
        <PostSensitiveGate labels={labels} safeMode={safeMode} compact>
          <p className="guild-composer-reply-text">
            <PostRichText text={parsePostText(post.value)} />
          </p>
        </PostSensitiveGate>
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
export function ComposerSheet({
  open,
  mode,
  target,
  targetAuthorProfile,
  onModeChange,
  destination,
  feedTargets,
  initialDrop = null,
  initialText = '',
  pending,
  error,
  onClose,
  onSubmit,
}: ComposerSheetProps) {
  const titleId = useId();
  const formId = useId();
  const { accountId } = useAppWallet();
  const viewerShell = useViewerProfileShellContext();
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  // Seed from props when the sheet mounts already open (DropComposeHost).
  // `wasOpen` starts false so the open transition below always applies
  // `initialDrop` / `initialText` on first paint.
  const [text, setText] = useState(() => (open ? initialText.trim() : ''));
  const [pollEnabled, setPollEnabled] = useState(false);
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDurationMs, setPollDurationMs] = useState<number | undefined>();
  const [dropDraft, setDropDraft] = useState<ComposerDropDraft | null>(() =>
    open ? initialDrop : null
  );
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<
    { url: string; mime: string }[]
  >([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [contentWarning, setContentWarning] = useState('');
  const [nsfw, setNsfw] = useState(false);
  const [dropPickerOpen, setDropPickerOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const mediaStripRef = useRef<HTMLDivElement>(null);
  const sheetOpen = open && !closing;
  const viewport = useVisualViewportSheetMetrics(sheetOpen);
  const canUsePoll = mode === 'post' && !dropDraft;
  const canUseMedia = !pollEnabled && !dropDraft;
  const canUseDrop =
    mode === 'post' && !pollEnabled && mediaFiles.length === 0;

  const viewerName = accountId
    ? displayName(accountId, viewerShell?.displayName)
    : 'You';

  const priorityMentionAccounts = useMemo(() => {
    if ((mode !== 'reply' && mode !== 'quote') || !target) return undefined;
    return [
      {
        accountId: target.accountId,
        name: targetAuthorProfile?.displayName ?? null,
        avatar: targetAuthorProfile?.avatarUrl ?? null,
      },
    ];
  }, [mode, target, targetAuthorProfile]);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormKey((key) => key + 1);
      setText(initialText.trim());
      setPollEnabled(false);
      setPollOptions(['', '']);
      setPollDurationMs(undefined);
      setDropDraft(initialDrop);
      setMediaFiles([]);
      setMediaPreviews((current) => {
        for (const preview of current) URL.revokeObjectURL(preview.url);
        return [];
      });
      setMediaError(null);
      setContentWarning('');
      setNsfw(false);
      setDropPickerOpen(false);
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

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el || !sheetOpen) return;
    /* Grow with content; the sheet body is the only scroller (no nested field scroll). */
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
    el.style.overflowY = 'hidden';
  }, [text, pollEnabled, formKey, sheetOpen]);

  useEffect(() => {
    return () => {
      for (const preview of mediaPreviews) URL.revokeObjectURL(preview.url);
    };
  }, [mediaPreviews]);

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
    if (pending || !pollReady) return;
    if (!trimmed && mediaFiles.length === 0 && !dropDraft) return;
    if (trimmed.length > POST_TEXT_MAX_LENGTH) {
      setMediaError(
        `Posts can be at most ${POST_TEXT_MAX_LENGTH.toLocaleString()} characters.`
      );
      return;
    }
    const labels = normalizeComposerContentLabels({
      contentWarning,
      nsfw,
    });
    onSubmit({
      text:
        trimmed ||
        (mediaFiles.length > 0 || dropDraft ? (dropDraft ? '' : ' ') : ''),
      ...(canUsePoll && pollEnabled
        ? {
            poll: {
              options: filledPollOptions,
              ...(pollDurationMs != null ? { durationMs: pollDurationMs } : {}),
            },
          }
        : {}),
      ...(dropDraft ? { drop: dropDraft } : {}),
      ...(mediaFiles.length > 0 ? { files: mediaFiles } : {}),
      ...labels,
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
      setMediaFiles([]);
      setMediaPreviews((previews) => {
        for (const preview of previews) URL.revokeObjectURL(preview.url);
        return [];
      });
      setMediaError(null);
      setDropDraft(null);
      return true;
    });
  };

  const selectDrop = (drop: ComposerDropDraft) => {
    setDropDraft(drop);
    setPollEnabled(false);
    setPollOptions(['', '']);
    setPollDurationMs(undefined);
    setMediaFiles([]);
    setMediaPreviews((previews) => {
      for (const preview of previews) URL.revokeObjectURL(preview.url);
      return [];
    });
    setMediaError(null);
    setDropPickerOpen(false);
  };

  const removeMediaAt = (index: number) => {
    setMediaFiles((current) => current.filter((_, i) => i !== index));
    setMediaPreviews((current) => {
      const next = [...current];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return next;
    });
    setMediaError(null);
  };

  const attachMediaFiles = async (fileList: FileList | null) => {
    if (!fileList?.length || pending || !canUseMedia) return;
    setMediaError(null);
    const incoming = Array.from(fileList);
    const candidates: File[] = [];
    const candidatePreviews: { url: string; mime: string }[] = [];

    for (const file of incoming) {
      if (candidates.length >= POST_MEDIA_MAX_FILES) break;
      const errorMessage = await validatePostMediaFile(file);
      if (errorMessage) {
        setMediaError(errorMessage);
        continue;
      }
      candidates.push(file);
      candidatePreviews.push({
        url: URL.createObjectURL(file),
        mime: file.type || 'application/octet-stream',
      });
    }

    if (candidates.length === 0) {
      if (mediaInputRef.current) mediaInputRef.current.value = '';
      return;
    }

    const alreadyCount = mediaFiles.length;
    const room = Math.max(0, POST_MEDIA_MAX_FILES - alreadyCount);
    const take = candidates.slice(0, room);
    const takePreviews = candidatePreviews.slice(0, room);
    for (const preview of candidatePreviews.slice(room)) {
      URL.revokeObjectURL(preview.url);
    }

    if (room === 0 || candidates.length > room) {
      setMediaError(`You can attach up to ${POST_MEDIA_MAX_FILES} files.`);
    }
    if (take.length === 0) {
      if (mediaInputRef.current) mediaInputRef.current.value = '';
      return;
    }

    setPollEnabled(false);
    setPollOptions(['', '']);
    setPollDurationMs(undefined);
    setMediaFiles((current) =>
      [...current, ...take].slice(0, POST_MEDIA_MAX_FILES)
    );
    setMediaPreviews((current) =>
      [...current, ...takePreviews].slice(0, POST_MEDIA_MAX_FILES)
    );
    if (mediaInputRef.current) mediaInputRef.current.value = '';

    window.requestAnimationFrame(() => {
      const strip = mediaStripRef.current;
      if (!strip) return;
      strip.scrollTo({ left: strip.scrollWidth, behavior: 'smooth' });
    });
  };

  const inputPlaceholder =
    canUsePoll && pollEnabled ? POLL_PLACEHOLDER : PLACEHOLDER[mode];

  const textLength = text.length;
  const textRemaining = POST_TEXT_MAX_LENGTH - textLength;
  const textOverLimit = textLength > POST_TEXT_MAX_LENGTH;
  const showTextCount = textLength > 0;

  const canPost =
    (Boolean(text.trim()) || mediaFiles.length > 0 || Boolean(dropDraft)) &&
    !pending &&
    pollReady &&
    !textOverLimit;

  const showDestinationMenus =
    mode === 'post' && Boolean(feedTargets && feedTargets.options.length > 0);
  const roomOptions: ChoiceOption<string>[] | null =
    mode === 'post' && destination?.kind === 'guild'
      ? destination.loading && destination.channels.length === 0
        ? [{ value: '__loading__', label: 'Loading…', disabled: true }]
        : destination.channels.length > 0
          ? destination.channels.map((channel) => ({
              value: channel.id,
              label: channel.title,
            }))
          : [{ value: '__empty__', label: 'No rooms', disabled: true }]
      : null;
  const roomValue =
    destination?.kind === 'guild'
      ? destination.loading && destination.channels.length === 0
        ? '__loading__'
        : destination.selectedChannelId
      : '';
  // Only block while loading / posting — a single room must still open so
  // the chevron menu is not a dead control.
  const roomDisabled =
    pending ||
    (destination?.kind === 'guild' &&
      (Boolean(destination.loading) || destination.channels.length === 0));

  const destinationMenus =
    showDestinationMenus && feedTargets ? (
      <div
        className="guild-composer-destination-menus"
        role="group"
        aria-label="Post destination"
      >
        <ChoiceDrawerMenu
          label="Post to"
          value={feedTargets.selectedId}
          options={feedTargets.options.map(
            (option): ChoiceOption<string> => ({
              value: option.id,
              label: option.label,
            })
          )}
          onChange={feedTargets.onChange}
          disabled={pending}
          copy="Where this post appears"
          ariaLabel={`Post to ${
            feedTargets.options.find(
              (option) => option.id === feedTargets.selectedId
            )?.label ?? 'feed'
          }`}
          className="standing-view-menu guild-composer-dest-menu"
          zIndex={COMPOSER_NEST_Z}
        />
        {destination?.kind === 'guild' && roomOptions ? (
          <ChoiceDrawerMenu
            label="Room"
            value={roomValue}
            options={roomOptions}
            onChange={destination.onChannelChange}
            disabled={roomDisabled}
            copy="Guild room for this post"
            ariaLabel={`Room ${
              roomOptions.find((option) => option.value === roomValue)
                ?.label ?? ''
            }`}
            className="standing-view-menu guild-composer-dest-menu"
            zIndex={COMPOSER_NEST_Z}
          />
        ) : null}
      </div>
    ) : null;

  const identitySlot = showDestinationMenus ? (
    destinationMenus
  ) : accountId ? (
    <IdentityLine name={viewerName} handle={accountId} />
  ) : null;

  const selfBlock = (
    <div
      className={`guild-composer-self${
        showDestinationMenus ? ' has-destination-menus' : ''
      }`}
    >
      <ProfileAvatar
        src={viewerShell?.avatarUrl ?? null}
        fallbackInitial={viewerName}
        size="lg"
        className="guild-composer-row-avatar"
      />
      <div className="guild-composer-row-copy">
        {identitySlot}
        <ComposerHashtagTextarea
          textareaRef={textareaRef}
          placeholder={inputPlaceholder}
          ariaLabel={inputPlaceholder}
          value={text}
          maxLength={POST_TEXT_MAX_LENGTH}
          disabled={pending}
          onChange={setText}
          onFocus={scrollFieldIntoView}
          priorityMentionAccounts={priorityMentionAccounts}
        />
        {mediaPreviews.length > 0 ? (
          <div
            ref={mediaStripRef}
            className="guild-composer-media-preview"
            role="list"
            aria-label="Attached media"
          >
            {mediaPreviews.map((preview, index) => (
              <div key={preview.url} role="listitem">
                <PostMediaBlock
                  item={{ url: preview.url, mime: preview.mime }}
                  size="preview"
                  onRemove={pending ? undefined : () => removeMediaAt(index)}
                />
              </div>
            ))}
          </div>
        ) : null}
        {dropDraft ? (
          <div
            className="guild-composer-media-preview"
            role="list"
            aria-label={`Attached Drop: ${dropDraft.title}`}
          >
            <div role="listitem">
              {dropDraft.mediaUrl ? (
                <PostMediaBlock
                  item={{
                    url: dropDraft.mediaUrl,
                    mime: 'image/*',
                  }}
                  size="preview"
                  onRemove={pending ? undefined : () => setDropDraft(null)}
                />
              ) : (
                <div className="post-media-tile post-media-tile--preview guild-composer-drop-fallback-tile">
                  <span className="guild-composer-drop-preview-fallback" />
                  {!pending ? (
                    <button
                      type="button"
                      className="post-media-remove"
                      aria-label="Remove Drop"
                      onClick={() => setDropDraft(null)}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : null}
        {canUsePoll && pollEnabled ? (
          <div className="guild-composer-poll">
            <div className="guild-composer-poll-options">
              {pollOptions.map((option, index) => (
                <div
                  key={`poll-option-${index}`}
                  className="guild-composer-poll-row"
                >
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
        <div className="guild-composer-labels" aria-label="Content labels">
          <input
            className="guild-composer-warning-input"
            value={contentWarning}
            maxLength={80}
            disabled={pending}
            placeholder="Content warning (optional)"
            aria-label="Content warning"
            onChange={(event) => setContentWarning(event.target.value)}
            onFocus={scrollFieldIntoView}
          />
          <button
            type="button"
            className={`guild-composer-poll-chip${nsfw ? ' is-active' : ''}`}
            disabled={pending}
            aria-pressed={nsfw}
            onClick={() => setNsfw((current) => !current)}
          >
            NSFW
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleSheetClosed}
      tone="os"
      initialDetent="full"
      zIndex={COMPOSER_SHEET_Z}
      ariaLabelledBy={titleId}
      backdropLabel="Close composer"
      bodyClassName="guild-composer-sheet-body"
      panelClassName="guild-composer-sheet-panel"
      panelStyle={panelStyle}
      header={
        <>
          <div
            className={`standing-sheet-header guild-composer-sheet-header${
              mode === 'post' ? ' is-compact' : ''
            }`}
          >
            <div className="standing-sheet-subject-row">
              {mode === 'post' ? (
                <h2 id={titleId} className="sr-only">
                  {TITLE[mode]}
                </h2>
              ) : (
                <div className="standing-sheet-subject">
                  <div className="standing-sheet-subject-copy">
                    <h2 id={titleId} className="standing-sheet-subject-name">
                      {TITLE[mode]}
                    </h2>
                  </div>
                </div>
              )}
              <div className="standing-sheet-actions">
                <SheetCloseButton
                  onClick={requestClose}
                  ariaLabel="Close composer"
                />
              </div>
            </div>
            {mode !== 'post' && onModeChange ? (
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
                className={`guild-composer-tool${
                  mediaFiles.length > 0 ? ' is-active' : ''
                }`}
                disabled={
                  !canUseMedia ||
                  pending ||
                  mediaFiles.length >= POST_MEDIA_MAX_FILES
                }
                title="Add photo or video"
                aria-label="Add photo or video"
                aria-pressed={mediaFiles.length > 0}
                onClick={() => mediaInputRef.current?.click()}
              >
                {mediaFiles.length > 0 ? (
                  <ImageFillIcon className="guild-composer-tool-icon" />
                ) : (
                  <ImageIcon className="guild-composer-tool-icon" />
                )}
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
                {pollEnabled ? (
                  <ChartVerticalFillIcon className="guild-composer-tool-icon" />
                ) : (
                  <ChartVerticalIcon className="guild-composer-tool-icon" />
                )}
              </button>
              <button
                type="button"
                className={`guild-composer-tool${
                  dropDraft ? ' is-active' : ''
                }`}
                disabled={!canUseDrop || pending}
                title={
                  canUseDrop
                    ? dropDraft
                      ? 'Change Drop'
                      : 'Post a Drop'
                    : pollEnabled
                      ? 'Remove poll to post a Drop'
                      : mediaFiles.length > 0
                        ? 'Remove photos to post a Drop'
                        : 'Drops are for new posts'
                }
                aria-label={
                  canUseDrop
                    ? dropDraft
                      ? 'Change Drop'
                      : 'Post a Drop'
                    : pollEnabled
                      ? 'Remove poll to post a Drop'
                      : mediaFiles.length > 0
                        ? 'Remove photos to post a Drop'
                        : 'Drops are for new posts'
                }
                aria-pressed={Boolean(dropDraft)}
                onClick={() => {
                  if (!canUseDrop || pending) return;
                  setDropPickerOpen(true);
                }}
              >
                {dropDraft ? (
                  <StarsCFillIcon className="guild-composer-tool-icon" />
                ) : (
                  <StarsCIcon className="guild-composer-tool-icon" />
                )}
              </button>
            </div>
            <div className="guild-composer-toolbar-end">
              <span
                className={[
                  'guild-composer-char-count',
                  showTextCount ? '' : 'is-idle',
                  textRemaining <= POST_TEXT_WARN_REMAINING ? 'is-warn' : '',
                  textOverLimit ? 'is-error' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-live="polite"
                aria-hidden={!showTextCount}
                aria-label={
                  showTextCount
                    ? `${textRemaining} characters remaining`
                    : undefined
                }
              >
                {showTextCount ? textRemaining : '\u00a0'}
              </span>
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
            {selfBlock}
          </div>
        ) : (
          selfBlock
        )}

        <input
          ref={mediaInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          multiple
          hidden
          aria-hidden
          onChange={(event) => void attachMediaFiles(event.target.files)}
        />

        {mediaError ? <p className="guild-form-error">{mediaError}</p> : null}
        {error ? <p className="guild-form-error">{error}</p> : null}
      </form>
    </GlassSheet>
    <ComposerDropPicker
      open={dropPickerOpen && sheetOpen}
      enabled={sheetOpen && mode === 'post'}
      onClose={() => setDropPickerOpen(false)}
      accountId={accountId}
      selectedDropKey={
        dropDraft?.tokenId?.trim() || dropDraft?.collectionId?.trim() || null
      }
      onSelect={selectDrop}
      zIndex={COMPOSER_NEST_Z}
    />
    </>
  );
}

/** @deprecated Prefer `ComposerSheet`. */
export const GuildComposerSheet = ComposerSheet;
