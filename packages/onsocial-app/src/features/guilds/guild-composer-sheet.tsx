'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { flushSync } from 'react-dom';
import {
  type PostRow,
  type ProfileAboutAlign,
} from '@onsocial/sdk';
import {
  ChartVerticalFillIcon,
  ChartVerticalIcon,
  DiscardConfirmSheet,
  ImageFillIcon,
  ImageIcon,
  MapMarkerFillIcon,
  MapMarkerIcon,
  MultiplyIcon,
  NoteTextIcon,
  OsHugSheet,
  OsIconAction,
  OsPageSheet,
  PlusCircleFillIcon,
  PlusCircleIcon,
  StarsCFillIcon,
  StarsCIcon,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import {
  ChoiceDrawerMenu,
  type ChoiceOption,
} from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
} from '@onsocial/ui';
import { AccountAvatar } from '@/components/profile/account-avatar';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useViewerProfileShellContext } from '@/contexts/viewer-profile-shell-context';
import { useViewerWalletMoodVars } from '@/hooks/use-viewer-wallet-mood-vars';
import {
  pageContentDrawerPanelStyle,
  portfolioMoodShellStyle,
  resolvePortfolioMood,
} from '@/lib/moods/resolve';
import { PostIdentityMeta } from '@/features/home/post-identity-meta';
import { PostRichText } from '@/features/home/post-rich-text';
import { ComposerDropPicker } from '@/features/guilds/composer-drop-picker';
import {
  COMPOSER_MIN_POLL_OPTIONS,
  ComposerThreadBeat,
  type ComposerSheetBeat,
} from '@/features/guilds/composer-thread-beat';
import { OsChipRail } from '@/components/os/os-chip-rail';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { scarceNestZIndex } from '@/features/scarces/scarce-overlay-z';
import {
  focusComposerField,
  scrollMobileFieldIntoView,
  useMobileFieldFocusScroll,
} from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import type { PostAuthorProfile } from '@/hooks/use-post-author-profiles';
import {
  parsePostText,
  POST_TEXT_MAX_LENGTH,
  POST_TEXT_WARN_REMAINING,
} from '@/lib/post-display';
import {
  POST_MEDIA_MAX_FILES,
  postMediaLocalPreviewUrl,
  postMediaPreviewEntriesFromFiles,
  postMediaRevokeLocalPreviewUrl,
  validatePostMediaFile,
} from '@/lib/post-media';
import { parsePostContentLabels } from '@/lib/post-content-labels';
import { displayName, fallbackLabel } from '@/lib/profile-display';
import { SHEET_Z } from '@/lib/sheet-z';
import { PostSensitiveGate } from '@/features/home/post-sensitive-gate';
import { useViewerSafeMode } from '@/hooks/use-viewer-safe-mode';
import {
  canAddComposerThreadBeat,
  collapseTrailingEmptyComposerBeat,
  composerBeatsToSubmit,
  composerThreadHasFilledExtras,
  emptyComposerBeat,
  keepUnsentComposerBeats,
  publishableComposerBeats,
  removeComposerThreadBeat,
  threadPlusHint,
  type ComposerBeat,
} from '@/lib/composer-thread';

type SheetBeat = ComposerSheetBeat;

let sheetBeatSeq = 0;

function nextSheetBeatId() {
  sheetBeatSeq += 1;
  return `beat-${sheetBeatSeq}`;
}

function emptySheetBeat(
  seed?: Partial<
    Pick<ComposerBeat, 'text' | 'files' | 'drop' | 'articleMode' | 'articleTitle'>
  >
): SheetBeat {
  const files = seed?.files ? [...seed.files] : [];
  return {
    ...emptyComposerBeat({ ...seed, files }),
    id: nextSheetBeatId(),
    previews: postMediaPreviewEntriesFromFiles(files),
  };
}

function sheetBeatFromComposer(beat: ComposerBeat): SheetBeat {
  return {
    ...beat,
    files: [...beat.files],
    pollOptions: [...beat.pollOptions],
    id: nextSheetBeatId(),
    previews: postMediaPreviewEntriesFromFiles(beat.files),
  };
}

function composerBeatFromSheet(beat: SheetBeat): ComposerBeat {
  return {
    text: beat.text,
    pollEnabled: beat.pollEnabled,
    pollOptions: [...beat.pollOptions],
    ...(beat.pollDurationMs != null
      ? { pollDurationMs: beat.pollDurationMs }
      : {}),
    drop: beat.drop,
    files: [...beat.files],
    contentWarning: beat.contentWarning,
    nsfw: beat.nsfw,
    placeDraft: beat.placeDraft,
    placeOpen: beat.placeOpen,
    articleMode: beat.articleMode,
    articleTitle: beat.articleTitle,
    articleAlign: beat.articleAlign,
  };
}

function seedSheetBeats(input: {
  initialBeats?: ComposerBeat[];
  initialText: string;
  initialFiles: File[];
  initialDrop: ComposerDropDraft | null;
  initialArticleMode: boolean;
}): SheetBeat[] {
  if (input.initialBeats && input.initialBeats.length > 0) {
    return input.initialBeats.map(sheetBeatFromComposer);
  }
  return [
    emptySheetBeat({
      text: input.initialText,
      files: input.initialFiles,
      drop: input.initialDrop,
      articleMode: input.initialArticleMode,
    }),
  ];
}

function revokeSheetBeatPreviews(beat: SheetBeat) {
  revokeComposerPreviewFiles(beat.files);
}

const COMPOSER_NEST_Z = scarceNestZIndex(SHEET_Z.list);

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
  /** Titled article — Writing shelf. Not used with poll or drop. */
  article?: { title: string; align?: ProfileAboutAlign };
  /** Attached image/video files (uploaded by SDK on write). */
  files?: File[];
  /** Optional place slug(s) — PostV1 `places` (city / venue / event). */
  places?: string[];
  /** Optional spoiler / content warning (PostV1 `contentWarning`). */
  contentWarning?: string;
  /** Hard NSFW flag (PostV1 `nsfw`). */
  nsfw?: boolean;
  /** Extra self-replies after this root. New personal posts only. */
  thread?: ComposerSubmit[];
}

/** Result from a parent publish — used to keep unsent beats after a partial flush. */
export type ComposerPublishResult = {
  confirmed: boolean;
  postedCount?: number;
  totalCount?: number;
};
/** @deprecated Prefer `ComposerSubmit`. */
export type GuildComposerSubmit = ComposerSubmit;

const TITLE: Record<ComposerMode, string> = {
  post: 'New post',
  reply: 'Reply',
  quote: 'Quote',
};

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
      /** @deprecated Unused — identity + Post to menus cover this. */
      label?: string;
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
  /**
   * Optional author switcher — Me vs DAO (eligible proposers only).
   * When mode is DAO, `daoOptions` lists which DAO to post as.
   */
  authorTargets?: {
    mode: 'me' | 'dao';
    onModeChange: (mode: 'me' | 'dao') => void;
    daoOptions: { id: string; label: string }[];
    selectedDaoId: string | null;
    onDaoChange: (daoAccountId: string) => void;
    daoLoading?: boolean;
  };
  /** Prefill a Drop reference chip (“Post this Drop”). */
  initialDrop?: ComposerDropDraft | null;
  /** Prefill caption when opening with a Drop. */
  initialText?: string;
  /** Prefill media when expanding from the compact write dock. */
  initialFiles?: File[];
  /** Open already flipped to Article (Writing shelf CTA). */
  initialArticleMode?: boolean;
  /** Restore a closed new-post thread (text / polls / extras). */
  initialBeats?: ComposerBeat[];
  pending: boolean;
  error?: string | null;
  onClose: (draft?: {
    text: string;
    files: File[];
    beats?: ComposerBeat[];
  }) => void;
  onSubmit: (
    payload: ComposerSubmit
  ) => void | Promise<void | ComposerPublishResult>;
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
      <AccountAvatar
        accountId={post.accountId}
        kind={authorProfile?.kind}
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

function postMediaSeedKey(files: readonly File[]): string {
  if (files.length === 0) return '';
  return files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .join('\0');
}

function revokeComposerPreviewFiles(files: readonly File[]) {
  for (const file of files) postMediaRevokeLocalPreviewUrl(file);
}

/**
 * WYSIWYG composer in an OsPageSheet (`surface="page"` — same flat fill as the
 * old slide-over). Polls attach as an inline card on new posts only; replies/
 * quotes stay text.
 */
export function ComposerSheet({
  open,
  mode,
  target,
  targetAuthorProfile,
  onModeChange,
  destination,
  feedTargets,
  authorTargets,
  initialDrop = null,
  initialText = '',
  initialFiles = [],
  initialArticleMode = false,
  initialBeats,
  pending,
  error,
  onClose,
  onSubmit,
}: ComposerSheetProps) {
  const formId = useId();
  const titleId = useId();
  const { accountId } = useAppWallet();
  const viewerShell = useViewerProfileShellContext();
  const { moodId: fetchedMoodId, style: fetchedMoodStyle } =
    useViewerWalletMoodVars(
      accountId ?? '',
      undefined,
      open && Boolean(accountId)
    );
  // Seed protocol mood immediately so the slide never flashes a flat empty
  // base while the wallet mood fetch catches up.
  const fallbackMood = useMemo(() => resolvePortfolioMood({}), []);
  const viewerMoodId = fetchedMoodId ?? (accountId ? fallbackMood.id : null);
  const viewerMoodStyle = useMemo(() => {
    if (fetchedMoodStyle) return fetchedMoodStyle;
    if (!accountId) return undefined;
    return {
      ...portfolioMoodShellStyle(fallbackMood.cssVars),
      ...pageContentDrawerPanelStyle(fallbackMood.cssVars),
    } as CSSProperties;
  }, [accountId, fallbackMood.cssVars, fetchedMoodStyle]);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  // Seed from props when the sheet mounts already open (DropComposeHost).
  // `wasOpen` starts false so the open transition below always applies
  // `initialDrop` / `initialText` on first paint.
  const [beats, setBeats] = useState<SheetBeat[]>(() =>
    open
      ? seedSheetBeats({
          initialBeats,
          initialText,
          initialFiles,
          initialDrop,
          initialArticleMode: initialArticleMode && mode === 'post',
        })
      : [emptySheetBeat()]
  );
  const [focusedBeat, setFocusedBeat] = useState(0);
  const [plusPressed, setPlusPressed] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [dropPickerOpen, setDropPickerOpen] = useState(false);
  const [articleExitConfirmOpen, setArticleExitConfirmOpen] = useState(false);
  const [daoThreadConfirmOpen, setDaoThreadConfirmOpen] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const placeInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const mediaStripRef = useRef<HTMLDivElement>(null);
  const [appliedMediaSeedKey, setAppliedMediaSeedKey] = useState('');
  const warningInputRef = useRef<HTMLInputElement>(null);
  const viewport = useVisualViewportSheetMetrics(open);
  const postingAsDao = authorTargets?.mode === 'dao';
  const canComposeThread = mode === 'post' && !postingAsDao;
  const safeFocus = Math.min(focusedBeat, Math.max(0, beats.length - 1));
  const beat = beats[safeFocus] ?? emptySheetBeat();
  const {
    text,
    pollEnabled,
    drop: dropDraft,
    files: mediaFiles,
    previews: mediaPreviews,
    contentWarning,
    nsfw,
    placeOpen,
    articleMode,
    articleTitle,
  } = beat;
  const articleTitleTrimmed = Boolean(articleTitle.trim());
  const canUseArticle = mode === 'post' && !dropDraft && !pollEnabled;
  const canUsePoll = mode === 'post' && !dropDraft && !articleMode;
  const canUseMedia = !pollEnabled && !dropDraft;
  const canUseDrop =
    mode === 'post' &&
    !pollEnabled &&
    !articleMode &&
    mediaFiles.length === 0;
  const canUsePlace = mode === 'post';
  const canAddThread = canComposeThread && canAddComposerThreadBeat(beats);

  const patchBeat = (index: number, partial: Partial<SheetBeat>) => {
    setBeats((current) => {
      const target = Math.min(index, Math.max(0, current.length - 1));
      return current.map((row, rowIndex) =>
        rowIndex === target ? { ...row, ...partial } : row
      );
    });
  };

  const patchFocused = (partial: Partial<SheetBeat>) => {
    patchBeat(focusedBeat, partial);
  };

  const focusBeat = (nextFocus: number) => {
    const next = collapseTrailingEmptyComposerBeat(beats, nextFocus);
    if (next.beats.length !== beats.length) {
      const dropped = beats[beats.length - 1];
      if (dropped) revokeSheetBeatPreviews(dropped);
    }
    setBeats(next.beats);
    setFocusedBeat(next.focus);
  };

  const removeThreadBeat = (index: number) => {
    if (pending || beats.length < 2) return;
    const next = removeComposerThreadBeat(beats, index, safeFocus);
    if (next.beats.length === beats.length) return;
    const removed = beats[index];
    if (removed) revokeSheetBeatPreviews(removed);
    setBeats(next.beats);
    setFocusedBeat(next.focus);
  };

  const collapseThreadToFirst = () => {
    setBeats((current) => {
      const [first, ...rest] = current;
      for (const row of rest) revokeSheetBeatPreviews(row);
      return [first ?? emptySheetBeat()];
    });
    setFocusedBeat(0);
  };

  const requestAuthorMode = (next: 'me' | 'dao') => {
    if (!authorTargets) return;
    if (next === authorTargets.mode) return;
    if (next === 'dao' && composerThreadHasFilledExtras(beats)) {
      setDaoThreadConfirmOpen(true);
      return;
    }
    if (next === 'dao' && beats.length > 1) {
      collapseThreadToFirst();
    }
    authorTargets.onModeChange(next);
  };

  const confirmDaoThreadSwitch = () => {
    collapseThreadToFirst();
    setDaoThreadConfirmOpen(false);
    authorTargets?.onModeChange('dao');
  };

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

  const initialMediaSeedKey = postMediaSeedKey(initialFiles);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setFormKey((key) => key + 1);
      setBeats((current) => {
        for (const row of current) revokeSheetBeatPreviews(row);
        return seedSheetBeats({
          initialBeats,
          initialText,
          initialFiles,
          initialDrop,
          initialArticleMode: initialArticleMode && mode === 'post',
        });
      });
      setFocusedBeat(0);
      setPlusPressed(false);
      setAppliedMediaSeedKey(initialMediaSeedKey);
      setMediaError(null);
      setLabelsOpen(false);
      setDropPickerOpen(false);
      setArticleExitConfirmOpen(false);
      setDaoThreadConfirmOpen(false);
    } else {
      setAppliedMediaSeedKey('');
      setArticleExitConfirmOpen(false);
    }
  } else if (open && appliedMediaSeedKey !== initialMediaSeedKey) {
    setAppliedMediaSeedKey(initialMediaSeedKey);
    setBeats((current) => {
      const [first, ...rest] = current;
      if (!first) {
        return [
          emptySheetBeat({
            text: initialText,
            files: initialFiles,
            drop: initialDrop,
          }),
        ];
      }
      revokeComposerPreviewFiles(first.files);
      return [
        {
          ...first,
          files: [...initialFiles],
          previews: postMediaPreviewEntriesFromFiles(initialFiles),
        },
        ...rest,
      ];
    });
  }

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      if (initialArticleMode && mode === 'post') {
        focusComposerField(titleInputRef.current);
      } else {
        focusComposerField(textareaRef.current);
      }
    }, 280);
    return () => window.clearTimeout(focusTimer);
  }, [open, mode, formKey, initialArticleMode]);

  useEffect(() => {
    if (!open || !labelsOpen) return;
    const focusTimer = window.setTimeout(() => {
      const field = warningInputRef.current;
      if (!field) return;
      field.focus();
      scrollMobileFieldIntoView(field);
    }, 40);
    return () => window.clearTimeout(focusTimer);
  }, [open, labelsOpen, formKey]);

  useEffect(() => {
    if (!open || !placeOpen) return;
    const focusTimer = window.setTimeout(() => {
      const field = placeInputRef.current;
      if (!field) return;
      field.focus();
      scrollMobileFieldIntoView(field);
    }, 40);
    return () => window.clearTimeout(focusTimer);
  }, [open, placeOpen, formKey]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const publishBeats = publishableComposerBeats(beats, canComposeThread);
    if (publishBeats.length === 0) return;
    if (publishBeats.some((row) => row.text.length > POST_TEXT_MAX_LENGTH)) {
      setMediaError(
        `Posts can be at most ${POST_TEXT_MAX_LENGTH.toLocaleString()} characters.`
      );
      return;
    }
    const pollRowsReady = publishBeats.every((row) => {
      if (!row.pollEnabled) return true;
      const options = normalizePollOptions(row.pollOptions);
      return (
        options.length >= COMPOSER_MIN_POLL_OPTIONS &&
        options.length === new Set(options).size
      );
    });
    if (!pollRowsReady) return;
    const payload = composerBeatsToSubmit(publishBeats);
    if (!payload) return;
    void (async () => {
      const result = await onSubmit(payload);
      if (!result || result.confirmed) return;
      const posted = result.postedCount ?? 0;
      const total = result.totalCount ?? 0;
      if (posted <= 0 || posted >= total) return;
      setBeats((current) => {
        const leftover = keepUnsentComposerBeats(current, posted);
        const leftoverIds = new Set(leftover.map((row) => row.id));
        for (const row of current) {
          if (!leftoverIds.has(row.id)) revokeSheetBeatPreviews(row);
        }
        return leftover;
      });
      setFocusedBeat(0);
    })();
  };

  const panelStyle = useMemo((): CSSProperties | undefined => {
    if (!viewport.isMobile || viewport.lift <= 0) return undefined;
    return {
      marginBottom: `calc(${viewport.lift}px - env(safe-area-inset-bottom, 0px))`,
    };
  }, [viewport.isMobile, viewport.lift]);

  const requestClose = () => {
    if (pending) return;
    const first = beats[0] ?? emptySheetBeat();
    onClose({
      text: first.text,
      files: first.files,
      beats: beats.map(composerBeatFromSheet),
    });
  };

  const togglePlace = () => {
    if (!canUsePlace || pending) return;
    if (placeOpen) {
      patchFocused({ placeOpen: false, placeDraft: '' });
      return;
    }
    patchFocused({ placeOpen: true });
  };

  const togglePoll = () => {
    if (!canUsePoll || pending) return;
    if (pollEnabled) {
      patchFocused({
        pollEnabled: false,
        pollOptions: ['', ''],
        pollDurationMs: undefined,
      });
      return;
    }
    revokeComposerPreviewFiles(mediaFiles);
    setMediaError(null);
    patchFocused({
      pollEnabled: true,
      drop: null,
      articleMode: false,
      articleTitle: '',
      articleAlign: 'left',
      files: [],
      previews: [],
    });
  };

  const clearArticleMode = () => {
    patchFocused({
      articleMode: false,
      articleTitle: '',
      articleAlign: 'left',
    });
    setArticleExitConfirmOpen(false);
    queueMicrotask(() => focusComposerField(textareaRef.current));
  };

  const toggleArticle = () => {
    if (!canUseArticle || pending) return;
    if (articleMode) {
      if (articleTitleTrimmed) {
        setArticleExitConfirmOpen(true);
        return;
      }
      clearArticleMode();
      return;
    }
    setMediaError(null);
    patchFocused({
      articleMode: true,
      pollEnabled: false,
      pollOptions: ['', ''],
      pollDurationMs: undefined,
      drop: null,
    });
    queueMicrotask(() => focusComposerField(titleInputRef.current));
  };

  const selectDrop = (drop: ComposerDropDraft) => {
    revokeComposerPreviewFiles(mediaFiles);
    setMediaError(null);
    setDropPickerOpen(false);
    patchFocused({
      drop,
      pollEnabled: false,
      pollOptions: ['', ''],
      pollDurationMs: undefined,
      articleMode: false,
      articleTitle: '',
      articleAlign: 'left',
      files: [],
      previews: [],
    });
  };

  const addThreadBeat = () => {
    if (!canAddThread || pending) return;
    const nextIndex = beats.length;
    flushSync(() => {
      setBeats((current) => {
        if (!canAddComposerThreadBeat(current)) return current;
        return [...current, emptySheetBeat()];
      });
      setFocusedBeat(nextIndex);
    });
    focusComposerField(textareaRef.current);
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
        url: postMediaLocalPreviewUrl(file),
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
    for (const file of candidates.slice(room)) {
      postMediaRevokeLocalPreviewUrl(file);
    }

    if (room === 0 || candidates.length > room) {
      setMediaError(`You can attach up to ${POST_MEDIA_MAX_FILES} files.`);
    }
    if (take.length === 0) {
      if (mediaInputRef.current) mediaInputRef.current.value = '';
      return;
    }

    patchFocused({
      pollEnabled: false,
      pollOptions: ['', ''],
      pollDurationMs: undefined,
      files: [...mediaFiles, ...take].slice(0, POST_MEDIA_MAX_FILES),
      previews: [...mediaPreviews, ...takePreviews].slice(
        0,
        POST_MEDIA_MAX_FILES
      ),
    });
    if (mediaInputRef.current) mediaInputRef.current.value = '';

    window.requestAnimationFrame(() => {
      const strip = mediaStripRef.current;
      if (!strip) return;
      strip.scrollTo({ left: strip.scrollWidth, behavior: 'smooth' });
    });
  };

  const textLength = text.length;
  const textRemaining = POST_TEXT_MAX_LENGTH - textLength;
  const textOverLimit = textLength > POST_TEXT_MAX_LENGTH;
  const showTextCount = textLength > 0;

  const publishBeats = publishableComposerBeats(beats, canComposeThread);
  const threadPollReady = publishBeats.every((row) => {
    if (!row.pollEnabled) return true;
    const options = normalizePollOptions(row.pollOptions);
    return (
      options.length >= COMPOSER_MIN_POLL_OPTIONS &&
      options.length === new Set(options).size
    );
  });
  const canPost =
    publishBeats.length > 0 &&
    !pending &&
    threadPollReady &&
    publishBeats.every(
      (row) =>
        row.text.length <= POST_TEXT_MAX_LENGTH &&
        (!row.articleMode || Boolean(row.articleTitle.trim()))
    );
  const publishingArticle =
    mode === 'post' && publishBeats.some((row) => row.articleMode);

  const showDestinationMenus =
    mode === 'post' &&
    (Boolean(feedTargets && feedTargets.options.length > 0) ||
      Boolean(authorTargets));
  const roomOptions: ChoiceOption<string>[] | null =
    mode === 'post' && destination?.kind === 'guild' && !postingAsDao
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

  const authorMenus =
    mode === 'post' && authorTargets ? (
      <>
        <ChoiceDrawerMenu
          label="As"
          value={authorTargets.mode}
          options={[
            { value: 'me', label: 'Me' },
            {
              value: 'dao',
              label: 'DAO',
              disabled:
                Boolean(authorTargets.daoLoading) ||
                authorTargets.daoOptions.length === 0,
            },
          ]}
          onChange={(value) =>
            requestAuthorMode(value === 'dao' ? 'dao' : 'me')
          }
          disabled={pending}
          copy="Who publishes this post"
          ariaLabel={`As ${authorTargets.mode === 'dao' ? 'DAO' : 'Me'}`}
          className="standing-view-menu guild-composer-dest-menu"
          zIndex={COMPOSER_NEST_Z}
        />
        {authorTargets.mode === 'dao' ? (
          <ChoiceDrawerMenu
            label="DAO"
            value={authorTargets.selectedDaoId ?? ''}
            options={
              authorTargets.daoLoading && authorTargets.daoOptions.length === 0
                ? [
                    {
                      value: '__loading__',
                      label: 'Checking…',
                      disabled: true,
                    },
                  ]
                : authorTargets.daoOptions.map(
                    (option): ChoiceOption<string> => ({
                      value: option.id,
                      label: option.label,
                    })
                  )
            }
            onChange={authorTargets.onDaoChange}
            disabled={
              pending ||
              Boolean(authorTargets.daoLoading) ||
              authorTargets.daoOptions.length === 0
            }
            copy="DAO that publishes after approval"
            ariaLabel={`DAO ${
              authorTargets.daoOptions.find(
                (option) => option.id === authorTargets.selectedDaoId
              )?.label ?? ''
            }`}
            className="standing-view-menu guild-composer-dest-menu"
            zIndex={COMPOSER_NEST_Z}
          />
        ) : null}
      </>
    ) : null;

  const destinationMenus =
    showDestinationMenus && (feedTargets || authorTargets) ? (
      <div
        className="guild-composer-destination-menus"
        role="group"
        aria-label="Post destination"
      >
        {authorMenus}
        {feedTargets && !postingAsDao ? (
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
        ) : null}
        {postingAsDao ? (
          <ChoiceDrawerMenu
            label="Post to"
            value="public"
            options={[{ value: 'public', label: 'Public' }]}
            onChange={() => undefined}
            disabled
            copy="DAO posts publish on the DAO public feed after approval"
            ariaLabel="Post to Public"
            className="standing-view-menu guild-composer-dest-menu"
            zIndex={COMPOSER_NEST_Z}
          />
        ) : null}
        {destination?.kind === 'guild' && roomOptions && !postingAsDao ? (
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

  const focusFieldOnBeat = (index: number) => {
    const row = beats[index];
    if (index !== safeFocus) {
      flushSync(() => focusBeat(index));
    }
    const useTitle =
      mode === 'post' &&
      Boolean(row?.articleMode) &&
      !row?.drop &&
      !row?.pollEnabled;
    focusComposerField(
      useTitle ? titleInputRef.current : textareaRef.current
    );
  };

  const renderBeat = (row: SheetBeat, index: number) => {
    const focused = index === safeFocus;
    return (
      <ComposerThreadBeat
        row={row}
        index={index}
        mode={mode}
        target={target}
        targetAuthorProfile={targetAuthorProfile}
        muted={canComposeThread && beats.length > 1 && !focused}
        focused={focused}
        pending={pending}
        canComposeThread={canComposeThread}
        beatCount={beats.length}
        showDestinationMenus={showDestinationMenus}
        identitySlot={identitySlot}
        accountId={accountId}
        viewerKind={viewerShell?.kind}
        viewerAvatarUrl={viewerShell?.avatarUrl}
        viewerName={viewerName}
        textareaRef={focused ? textareaRef : undefined}
        titleInputRef={focused ? titleInputRef : undefined}
        mediaStripRef={focused ? mediaStripRef : undefined}
        placeInputRef={focused ? placeInputRef : undefined}
        priorityMentionAccounts={priorityMentionAccounts}
        onPatch={(patch) => patchBeat(index, patch)}
        onRemove={
          beats.length > 1 ? () => removeThreadBeat(index) : undefined
        }
        onFocusBeat={() => focusFieldOnBeat(index)}
        onScrollField={scrollFieldIntoView}
        onOpenLabels={() => setLabelsOpen(true)}
        onMediaError={setMediaError}
      />
    );
  };

  const showModeRail = mode !== 'post' && Boolean(onModeChange);

  const modeChipRail = showModeRail ? (
    <OsChipRail
      className="discover-tab-bar--header guild-composer-mode-rail"
      ariaLabel="Composer mode"
      selection="option"
      items={[
        { id: 'reply', label: 'Reply' },
        { id: 'quote', label: 'Quote' },
      ]}
      value={mode === 'quote' ? 'quote' : 'reply'}
      onValueChange={(next) => {
        if (pending) return;
        onModeChange?.(next);
      }}
    />
  ) : null;

  const composerFooter = (
        <div
          className={`guild-composer-sheet-footer${
            viewport.lift > 0 ? ' is-keyboard-open' : ''
          }`}
          style={panelStyle}
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
                  articleMode ? ' is-active' : ''
                }`}
                disabled={!canUseArticle || pending}
                title={
                  canUseArticle
                    ? articleMode
                      ? 'Switch to a regular post'
                      : 'Write an article'
                    : 'Articles are for new posts'
                }
                aria-label={
                  canUseArticle
                    ? articleMode
                      ? 'Switch to a regular post'
                      : 'Write an article'
                    : 'Articles are for new posts'
                }
                aria-pressed={articleMode}
                onClick={toggleArticle}
              >
                <NoteTextIcon className="guild-composer-tool-icon" />
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
                    : articleMode
                      ? 'Turn off Article to add a poll'
                      : 'Polls are for new posts'
                }
                aria-label={
                  canUsePoll
                    ? pollEnabled
                      ? 'Remove poll'
                      : 'Add poll'
                    : articleMode
                      ? 'Turn off Article to add a poll'
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
                      : articleMode
                        ? 'Turn off Article to post a Drop'
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
                      : articleMode
                        ? 'Turn off Article to post a Drop'
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
              <button
                type="button"
                className={`guild-composer-tool${
                  placeOpen ? ' is-active' : ''
                }`}
                disabled={!canUsePlace || pending}
                title={
                  canUsePlace
                    ? placeOpen
                      ? 'Remove place'
                      : 'Add place'
                    : 'Place is for new posts'
                }
                aria-label={
                  canUsePlace
                    ? placeOpen
                      ? 'Remove place'
                      : 'Add place'
                    : 'Place is for new posts'
                }
                aria-pressed={placeOpen}
                onClick={togglePlace}
              >
                {placeOpen ? (
                  <MapMarkerFillIcon className="guild-composer-tool-icon" />
                ) : (
                  <MapMarkerIcon className="guild-composer-tool-icon" />
                )}
              </button>
              {canComposeThread ? (
                <button
                  type="button"
                  className={`guild-composer-tool${
                    plusPressed ? ' is-active' : ''
                  }`}
                  disabled={!canAddThread || pending}
                  title={threadPlusHint(beats)}
                  aria-label={threadPlusHint(beats)}
                  onMouseDown={(event) => {
                    if (!canAddThread || pending) return;
                    event.preventDefault();
                  }}
                  onPointerDown={() => {
                    if (!canAddThread || pending) return;
                    setPlusPressed(true);
                  }}
                  onPointerUp={() => setPlusPressed(false)}
                  onPointerCancel={() => setPlusPressed(false)}
                  onPointerLeave={() => setPlusPressed(false)}
                  onClick={addThreadBeat}
                >
                  {plusPressed ? (
                    <PlusCircleFillIcon className="guild-composer-tool-icon" />
                  ) : (
                    <PlusCircleIcon className="guild-composer-tool-icon" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className={`guild-composer-tool guild-composer-tool--cw${
                  contentWarning.trim() || nsfw ? ' is-active' : ''
                }`}
                disabled={pending}
                title={
                  contentWarning.trim() || nsfw
                    ? 'Edit content labels'
                    : 'Add content warning'
                }
                aria-label={
                  contentWarning.trim() || nsfw
                    ? 'Edit content labels'
                    : 'Add content warning'
                }
                aria-pressed={Boolean(contentWarning.trim() || nsfw)}
                onClick={() => setLabelsOpen(true)}
              >
                <span className="guild-composer-tool-cw" aria-hidden>
                  CW
                </span>
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
            </div>
          </div>
        </div>
  );

  return (
    <>
    <OsPageSheet
      open={open}
      onClose={requestClose}
      surface="page"
      presentation="appear"
      zIndex={SHEET_Z.list}
      ariaLabelledBy={titleId}
      backdropLabel="Close composer"
      moodId={viewerMoodId ?? undefined}
      moodStyle={viewerMoodStyle}
      panelStyle={panelStyle}
      panelClassName="guild-composer-sheet-panel"
      bodyClassName="guild-composer-sheet-body"
      header={null}
      footer={composerFooter}
    >
      <OsAppScreen
        title={
          mode === 'post' && articleMode ? 'New article' : TITLE[mode]
        }
        glassChrome
        compactChrome
        embedded
        leading={
          <OsIconAction
            ariaLabel="Close"
            disabled={pending}
            onClick={requestClose}
          >
            <MultiplyIcon className="glass-sheet-close-icon" aria-hidden />
          </OsIconAction>
        }
        heading={showModeRail ? modeChipRail : undefined}
        actions={
          <OsSheetActions
            layout="row-compact"
            size="sm"
            tone="frosted-primary"
            borderless
            className="guild-composer-toolbar-post guild-composer-header-post"
          >
            <OsSheetAction
              type="submit"
              form={formId}
              variant="primary"
              ready={canPost}
              pending={pending}
              pendingLabel={
                postingAsDao
                  ? 'Proposing…'
                  : mode === 'quote'
                    ? 'Quoting…'
                    : publishingArticle
                      ? 'Publishing…'
                      : 'Posting…'
              }
              disabled={!canPost}
            >
              {postingAsDao
                ? 'Propose'
                : mode === 'quote'
                  ? 'Quote'
                  : publishingArticle
                    ? 'Publish'
                    : 'Post'}
            </OsSheetAction>
          </OsSheetActions>
        }
        moodId={viewerMoodId}
        moodStyle={viewerMoodStyle}
      >
        <form
          id={formId}
          key={formKey}
          className="guild-composer-sheet-form"
          onSubmit={handleSubmit}
        >
          <span id={titleId} className="sr-only">
            {mode === 'post' && articleMode ? 'New article' : TITLE[mode]}
          </span>
        {mode === 'reply' && target ? (
          <div className="guild-composer-reply-flow">
            <ReplyTargetPreview
              post={target}
              authorProfile={targetAuthorProfile}
            />
            {renderBeat(beats[0] ?? emptySheetBeat(), 0)}
          </div>
        ) : canComposeThread && beats.length > 1 ? (
          <div className="guild-composer-thread" role="list" aria-label="Thread">
            {beats.map((row, index) => (
              <div
                key={row.id}
                role="listitem"
                className={[
                  'guild-composer-thread-item',
                  index < beats.length - 1 ? 'is-down' : '',
                  index > 0 ? 'is-up' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {renderBeat(row, index)}
              </div>
            ))}
          </div>
        ) : (
          renderBeat(beats[0] ?? emptySheetBeat(), 0)
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
      </OsAppScreen>
    </OsPageSheet>
    <ComposerDropPicker
      open={dropPickerOpen && open}
      enabled={open && mode === 'post'}
      onClose={() => setDropPickerOpen(false)}
      accountId={accountId}
      selectedDropKey={
        dropDraft?.tokenId?.trim() || dropDraft?.collectionId?.trim() || null
      }
      onSelect={selectDrop}
      zIndex={COMPOSER_NEST_Z}
    />
    <DiscardConfirmSheet
      open={articleExitConfirmOpen && open}
      title="Switch to a regular post?"
      body="The title will be cleared."
      discardLabel="Switch"
      keepEditingLabel="Keep article"
      zIndex={COMPOSER_NEST_Z}
      onDiscard={clearArticleMode}
      onKeepEditing={() => setArticleExitConfirmOpen(false)}
    />
    <DiscardConfirmSheet
      open={daoThreadConfirmOpen && open}
      title="Propose as a single post?"
      body="A DAO proposal is one Call. Extra thread posts will be cleared."
      discardLabel="Switch to DAO"
      keepEditingLabel="Keep thread"
      zIndex={COMPOSER_NEST_Z}
      onDiscard={confirmDaoThreadSwitch}
      onKeepEditing={() => setDaoThreadConfirmOpen(false)}
    />
    <OsHugSheet
      open={labelsOpen && open}
      onClose={() => setLabelsOpen(false)}
      chrome="choice"
      label="Content labels"
      closeAriaLabel="Close"
      backdropLabel="Close content labels"
      zIndex={COMPOSER_NEST_Z}
      bodyClassName="guild-composer-labels-sheet-body"
      panelStyle={viewerMoodStyle}
    >
      <label className="guild-composer-labels-field">
        <span className="guild-composer-labels-field-label">
          Content warning
        </span>
        <input
          ref={warningInputRef}
          className={`${osFieldBorderedClassName} guild-composer-warning-input`}
          value={contentWarning}
          maxLength={80}
          disabled={pending}
          placeholder="Warn people about…"
          aria-label="Content warning"
          onChange={(event) =>
            patchFocused({ contentWarning: event.target.value })
          }
          onFocus={scrollFieldIntoView}
        />
      </label>
      <label className={`guild-composer-nsfw-switch${nsfw ? ' is-on' : ''}`}>
        <input
          type="checkbox"
          role="switch"
          checked={nsfw}
          disabled={pending}
          aria-checked={nsfw}
          onChange={(event) => patchFocused({ nsfw: event.target.checked })}
        />
        <span className="guild-composer-nsfw-switch-track" aria-hidden />
        <span className="guild-composer-nsfw-switch-copy">
          <span className="guild-composer-nsfw-switch-title">
            Mark as NSFW
          </span>
          <span className="guild-composer-nsfw-switch-hint">
            Blurs in Safe mode
          </span>
        </span>
      </label>
      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          onClick={() => setLabelsOpen(false)}
        >
          Done
        </OsSheetAction>
      </OsSheetActions>
    </OsHugSheet>
    </>
  );
}

/** @deprecated Prefer `ComposerSheet`. */
export const GuildComposerSheet = ComposerSheet;
