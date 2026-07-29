'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  CARD_FORMAT_REGISTRY,
  isCardFormat,
  isCardFormatPalette,
  moodForCardFormat,
  type CardFormat,
  type MoodKey,
} from '@onsocial/text-card';
import type { PostRow } from '@onsocial/sdk';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  findLiveListingForPost,
  invalidateLiveListingsCache,
} from '@/features/market/market-listings';
import {
  fetchPublishableApps,
  type AppView,
} from '@/features/scarces/apps-data';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';
import {
  ScarceCardMoodPicker,
  type ScarceCardThemeOptions,
} from '@/features/scarces/scarce-card-mood-picker';
import { ScarceChoiceField } from '@/features/scarces/scarce-choice-field';
import {
  ScarceCoverIcon,
  ScarceFormatSwatch,
  type ScarceCoverMode,
} from '@/features/scarces/scarce-choice-visuals';
import {
  useSyncCommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { ScarceDetailsField } from '@/features/scarces/scarce-details-field';
import {
  postScarceKey,
  setScarceEmbedOverride,
} from '@/features/scarces/scarce-embed-ledger';
import {
  ScarcePostPreview,
  postScarceAudio,
  postScarceCoverImage,
  postScarceVideo,
} from '@/features/scarces/scarce-post-preview';
import { ScarceVideoFramePicker } from '@/features/scarces/scarce-video-frame-picker';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto } from '@/lib/app-near-rpc';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { parsePostText } from '@/lib/post-display';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const NEAR_INPUT_DECIMALS = 5;
const MIN_PRICE_NEAR = '0.01';
const PRESETS = ['0.1', '1', '5', '10'] as const;

/** Resale royalty presets in basis points (1000 = 10%). Paid to the post author. */
const ROYALTY_PRESETS = [
  { percent: 0, bps: 0 },
  { percent: 5, bps: 500 },
  { percent: 10, bps: 1000 },
  { percent: 15, bps: 1500 },
] as const;
const DEFAULT_ROYALTY_BPS = 1000;

/** Edition size — one listing, N purchases until sold out. */
const COPIES_PRESETS = [1, 5, 10, 25] as const;
const MIN_COPIES = 1;
const MAX_COPIES = 100;
const DEFAULT_COPIES = 1;
const MAX_ROYALTY_BPS = 5_000;

function parseCustomCopies(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return null;
  const copies = Number(value);
  return Number.isSafeInteger(copies) &&
    copies >= MIN_COPIES &&
    copies <= MAX_COPIES
    ? copies
    : null;
}

function parseCustomRoyaltyBps(raw: string): number | null {
  const value = raw.trim();
  if (!/^\d+(?:\.(?:0|5))?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return Number.isSafeInteger(bps) && bps <= MAX_ROYALTY_BPS ? bps : null;
}

function normalizeCustomRoyaltyInput(raw: string): string {
  const sanitized = raw.replace(/[^\d.]/g, '');
  if (!sanitized) return '';
  const [whole, ...fractions] = sanitized.split('.');
  if (fractions.length === 0) return whole;
  return `${whole || '0'}.${fractions.join('').slice(0, 1)}`;
}

function formatRoyaltyPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

const DEFAULT_CARD_THEME: ScarceCardThemeOptions = {
  cardFormat: 'thought',
  cardPalette: 'night',
  cardBg: moodForCardFormat('thought', 'night'),
  cardMarkShape: 'rule',
  cardMarkColor: 'auto',
  cardTitleAlign: 'left',
};
const CARD_DEFAULTS_STORAGE_PREFIX = 'onsocial.scarces.card-defaults:';
/** Match SDK `deriveTitle` — no trailing ellipsis (wallets add their own). */
const MINT_TITLE_MAX = 108;

function deriveMintTitle(text: string, maxCharacters = MINT_TITLE_MAX): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? '';
  const firstSentence = firstLine.split(/(?<=[.!?])\s+/)[0]?.trim() ?? '';
  if (
    firstSentence &&
    firstSentence.length < trimmed.length &&
    firstSentence.length <= maxCharacters
  ) {
    return firstSentence;
  }
  if (
    firstLine &&
    firstLine.length < trimmed.length &&
    firstLine.length <= maxCharacters
  ) {
    return firstLine;
  }
  if (trimmed.length <= maxCharacters) return trimmed;
  const window = trimmed.slice(0, maxCharacters);
  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace >= maxCharacters / 2) {
    return window.slice(0, lastSpace).trimEnd();
  }
  return window.trimEnd();
}

function readCardDefaults(accountId: string): ScarceCardThemeOptions {
  try {
    const stored = window.localStorage.getItem(
      `${CARD_DEFAULTS_STORAGE_PREFIX}${accountId}`
    );
    if (!stored) return DEFAULT_CARD_THEME;
    const parsed = JSON.parse(stored) as Partial<ScarceCardThemeOptions>;
    if (!isCardFormat(parsed.cardFormat)) return DEFAULT_CARD_THEME;
    const format = parsed.cardFormat;
    const palette = isCardFormatPalette(format, parsed.cardPalette)
      ? parsed.cardPalette
      : CARD_FORMAT_REGISTRY[format].defaultPalette;
    return {
      ...DEFAULT_CARD_THEME,
      ...parsed,
      cardFormat: format,
      cardPalette: palette,
      cardBg: moodForCardFormat(format, palette),
    };
  } catch {
    return DEFAULT_CARD_THEME;
  }
}

function extractListingId(response: unknown): string | undefined {
  if (!response || typeof response !== 'object') return undefined;
  const value = response as Record<string, unknown>;
  for (const key of ['listingId', 'listing_id'] as const) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (value.raw != null) return extractListingId(value.raw);
  if (value.result != null) return extractListingId(value.result);
  return undefined;
}

/**
 * Cover for a video / audio post. Wallets render NEP-177 `media` as a still
 * image, so a clip needs either a generated card, a frame from the video, or
 * a photo the creator picks. The media itself keeps playing on the post.
 */
type MediaCoverMode = ScarceCoverMode;

const VIDEO_COVER_OPTIONS = [
  {
    value: 'card' as const,
    label: 'Text card',
    leading: <ScarceCoverIcon mode="card" />,
  },
  {
    value: 'frame' as const,
    label: 'Frame',
    leading: <ScarceCoverIcon mode="frame" />,
  },
  {
    value: 'photo' as const,
    label: 'Photo',
    leading: <ScarceCoverIcon mode="photo" />,
  },
];

const AUDIO_COVER_OPTIONS = [
  {
    value: 'card' as const,
    label: 'Text card',
    leading: <ScarceCoverIcon mode="card" />,
  },
  {
    value: 'photo' as const,
    label: 'Cover',
    leading: <ScarceCoverIcon mode="photo" />,
  },
];

export interface ScarceListSuccessDetail {
  priceNear: string;
  listingId?: string;
}

interface ScarceListFormProps {
  post: PostRow;
  formId: string;
  authorName?: string | null;
  onSuccess?: (detail: ScarceListSuccessDetail) => void;
  onFooterStateChange?: (state: CommerceSheetFooterState | null) => void;
}

export function ScarceListForm({
  post,
  formId,
  authorName = null,
  onSuccess,
  onFooterStateChange,
}: ScarceListFormProps) {
  const { accountId, isConnected, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const onAmountFocus = useMobileFieldFocusScroll<HTMLInputElement>();
  const [amountInput, setAmountInput] = useState('1');
  const [royaltyBps, setRoyaltyBps] = useState(DEFAULT_ROYALTY_BPS);
  const [copies, setCopies] = useState(DEFAULT_COPIES);
  const [isCustomCopies, setIsCustomCopies] = useState(false);
  const [customCopiesInput, setCustomCopiesInput] = useState('');
  const [isCustomRoyalty, setIsCustomRoyalty] = useState(false);
  const [customRoyaltyInput, setCustomRoyaltyInput] = useState('');
  const [cardTheme, setCardTheme] =
    useState<ScarceCardThemeOptions>(DEFAULT_CARD_THEME);
  const [photoCardFormat, setPhotoCardFormat] = useState<
    'cover' | 'receipt' | 'proof'
  >('cover');
  const [defaultsAccountId, setDefaultsAccountId] = useState<string | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);
  const [videoCoverMode, setVideoCoverMode] = useState<MediaCoverMode>(() => {
    // Video posts open on a frame — that's what people expect to sell.
    const hasImage = Boolean(postScarceCoverImage(post));
    const hasVideo = Boolean(postScarceVideo(post));
    return !hasImage && hasVideo ? 'frame' : 'card';
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverPending, setCoverPending] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [mintPreviewUrl, setMintPreviewUrl] = useState<string | null>(null);
  const [mintPreviewPending, setMintPreviewPending] = useState(false);
  const [mintPreviewError, setMintPreviewError] = useState<string | null>(null);
  const [storeOptions, setStoreOptions] = useState<AppView[]>([]);
  const [listAppId, setListAppId] = useState('');
  /** Last Frame scrub — survives Cover switches to Text / Photo. */
  const [frameSeek, setFrameSeek] = useState<number | null>(null);
  const frameCoverRef = useRef<File | null>(null);
  const coverPhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const authorId = post.accountId.trim();
    if (!authorId) {
      setCreatorAvatarUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const profile = await client.profiles.get(authorId);
        if (cancelled) return;
        const media = profile ? client.profiles.avatarMedia(profile) : null;
        // Cards need a still face — prefer image URL, else video poster.
        const faceUrl =
          media?.kind === 'image'
            ? media.url
            : (media?.poster ?? client.profiles.avatarUrl(profile) ?? null);
        setCreatorAvatarUrl(faceUrl);
      } catch {
        if (!cancelled) setCreatorAvatarUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post.accountId]);

  useEffect(() => {
    if (!accountId) {
      setStoreOptions([]);
      setListAppId('');
      return;
    }
    let cancelled = false;
    void fetchPublishableApps(accountId, { limit: 40 }).then((apps) => {
      if (cancelled) return;
      setStoreOptions(apps);
      setListAppId((current) =>
        current && apps.some((app) => app.appId === current) ? current : ''
      );
    });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const hasCoverImage = Boolean(postScarceCoverImage(post));
  const postVideo = useMemo(() => postScarceVideo(post), [post]);
  const postAudio = useMemo(() => postScarceAudio(post), [post]);
  const showVideoCoverPicker = !hasCoverImage && Boolean(postVideo);
  const showAudioCoverPicker =
    !hasCoverImage && !postVideo && Boolean(postAudio);
  const showMediaCoverPicker = showVideoCoverPicker || showAudioCoverPicker;
  const usesPhotoCard = hasCoverImage && photoCardFormat !== 'cover';
  const usesGeneratedCard = (!hasCoverImage && !coverFile) || usesPhotoCard;

  const mintBody = useMemo(() => parsePostText(post.value).trim(), [post]);
  const mintTitle = useMemo(() => {
    if (!mintBody) return `Post ${post.postId}`;
    // Same rules as SDK `deriveTitle` / `CARD_TITLE_LIMITS` for the format.
    const maxCharacters = usesGeneratedCard
      ? CARD_FORMAT_REGISTRY[cardTheme.cardFormat].maxCharacters
      : MINT_TITLE_MAX;
    return deriveMintTitle(mintBody, maxCharacters) || `Post ${post.postId}`;
  }, [mintBody, post.postId, usesGeneratedCard, cardTheme.cardFormat]);

  // Mint-true PNG preview (same gateway builder as list). Keep the last
  // PNG on screen while the next one loads — clearing it fell back to live
  // SVG and Letter/Erica briefly looked blank or like DM Sans.
  useEffect(() => {
    const wantsMintPreview = usesGeneratedCard && !usesPhotoCard;
    if (!wantsMintPreview || !accountId) {
      setMintPreviewUrl(null);
      setMintPreviewPending(false);
      setMintPreviewError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setMintPreviewPending(true);
      void (async () => {
        try {
          const client = createAppOnSocialClient(accountId);
          const result = await client.scarces.previewTextCard({
            title: mintTitle,
            creator: {
              accountId: post.accountId,
              ...(authorName?.trim() ? { displayName: authorName.trim() } : {}),
            },
            cardBg: cardTheme.cardBg,
            cardFormat: cardTheme.cardFormat,
            cardPalette: cardTheme.cardPalette,
            cardMarkShape: cardTheme.cardMarkShape,
            cardMarkColor: cardTheme.cardMarkColor,
            cardTitleAlign: cardTheme.cardTitleAlign,
            postId: post.postId,
            issuedAt: post.blockTimestamp || Date.now(),
          });
          if (cancelled) return;
          setMintPreviewUrl(result.dataUri);
          setMintPreviewError(null);
        } catch (cause) {
          if (cancelled) return;
          setMintPreviewError(
            cause instanceof Error ? cause.message : 'Could not preview card.'
          );
        } finally {
          if (!cancelled) setMintPreviewPending(false);
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    accountId,
    authorName,
    cardTheme.cardBg,
    cardTheme.cardFormat,
    cardTheme.cardMarkColor,
    cardTheme.cardMarkShape,
    cardTheme.cardPalette,
    cardTheme.cardTitleAlign,
    mintTitle,
    post.accountId,
    post.blockTimestamp,
    post.postId,
    usesGeneratedCard,
    usesPhotoCard,
  ]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const selectMediaCoverMode = useCallback((next: MediaCoverMode) => {
    setCoverError(null);
    setCoverPending(false);
    if (next === 'photo') {
      // Open the picker first — only commit Photo mode after a valid file so
      // Format chips and the text-card preview do not flash an empty state.
      coverPhotoInputRef.current?.click();
      return;
    }
    if (next === 'frame') {
      setVideoCoverMode('frame');
      // Restore the last grabbed still while the picker remounts to that seek.
      setCoverFile(frameCoverRef.current);
      return;
    }
    setVideoCoverMode(next);
    // Text card: clear the mint still so the generated card shows. Keep
    // frameCoverRef / frameSeek so Frame can reopen on the last moment.
    setCoverFile(null);
  }, []);

  const onCoverPhotoChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = '';
      if (!file) return;
      if (!isPostImageMime(file.type)) {
        setCoverError('Use a JPG, PNG, or WebP photo.');
        return;
      }
      if (file.size > POST_IMAGE_MAX_BYTES) {
        setCoverError('Photo must be 5 MB or smaller.');
        return;
      }
      setCoverError(null);
      setCoverFile(file);
      setVideoCoverMode('photo');
    },
    []
  );

  const selectPhotoCardFormat = useCallback(
    (next: 'cover' | 'receipt' | 'proof') => {
      setPhotoCardFormat(next);
      if (next === 'cover') return;
      const format = next as CardFormat;
      const palette = CARD_FORMAT_REGISTRY[format].defaultPalette;
      setCardTheme((current) => ({
        ...current,
        cardFormat: format,
        cardPalette: palette,
        cardBg: moodForCardFormat(format, palette),
        cardTitleAlign: 'left',
      }));
    },
    []
  );

  useEffect(() => {
    if (!accountId) {
      setDefaultsAccountId(null);
      return;
    }
    setCardTheme(readCardDefaults(accountId));
    setDefaultsAccountId(accountId);
  }, [accountId]);

  useEffect(() => {
    if (!accountId || defaultsAccountId !== accountId) return;
    window.localStorage.setItem(
      `${CARD_DEFAULTS_STORAGE_PREFIX}${accountId}`,
      JSON.stringify(cardTheme)
    );
  }, [accountId, cardTheme, defaultsAccountId]);

  const applyAmountInput = useCallback((raw: string) => {
    setAmountInput(normalizeAmountInput(raw, NEAR_INPUT_DECIMALS));
  }, []);

  const normalizedAmount = finalizeAmountInput(
    amountInput,
    NEAR_INPUT_DECIMALS
  );

  let amountError: string | null = null;
  if (normalizedAmount) {
    try {
      const yocto = BigInt(nearToYocto(normalizedAmount));
      const minYocto = BigInt(nearToYocto(MIN_PRICE_NEAR));
      if (yocto < minYocto) {
        amountError = `Minimum ${MIN_PRICE_NEAR} NEAR.`;
      }
    } catch {
      amountError = 'Invalid amount.';
    }
  }

  const customCopies = parseCustomCopies(customCopiesInput);
  const editionCount = isCustomCopies ? customCopies : copies;
  const customRoyaltyBps = parseCustomRoyaltyBps(customRoyaltyInput);
  const resolvedRoyaltyBps = isCustomRoyalty ? customRoyaltyBps : royaltyBps;

  const canSubmit =
    isConnected &&
    !pending &&
    !coverPending &&
    Boolean(normalizedAmount) &&
    !amountError &&
    editionCount != null &&
    resolvedRoyaltyBps != null;

  /** Why the List button is disabled — quiet, specific, no error tone. */
  const disabledReason =
    !isConnected || pending || canSubmit
      ? null
      : coverPending
        ? 'Grabbing your cover frame…'
        : !normalizedAmount
          ? 'Enter a price to list.'
          : editionCount == null
            ? 'Enter copies between 1 and 100.'
            : resolvedRoyaltyBps == null
              ? 'Enter a royalty between 0 and 50%.'
              : null;

  const footerState = useMemo((): CommerceSheetFooterState => {
    return {
      visible: true,
      primaryLabel: isConnected ? 'List for sale' : 'Connect wallet',
      primaryPendingLabel: 'Listing…',
      canSubmit: isConnected ? canSubmit : true,
      pending,
      disabled: pending || (isConnected && !canSubmit),
    };
  }, [canSubmit, isConnected, pending]);

  useSyncCommerceSheetFooter(footerState, onFooterStateChange);

  async function handleSubmit() {
    setFieldError(null);

    const priceNear = finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS);
    if (!priceNear) {
      setFieldError('Enter a price.');
      return;
    }
    try {
      const yocto = BigInt(nearToYocto(priceNear));
      if (yocto < BigInt(nearToYocto(MIN_PRICE_NEAR))) {
        setFieldError(`Minimum ${MIN_PRICE_NEAR} NEAR.`);
        return;
      }
    } catch {
      setFieldError('Invalid amount.');
      return;
    }
    if (editionCount == null || resolvedRoyaltyBps == null) return;

    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      // Posts keep their original cover by default. Receipt/Proof explicitly
      // turn a photo into a deterministic card with the image embedded.
      const response = await client.scarces.fromPost.list(post, priceNear, {
        copies: editionCount,
        ...(resolvedRoyaltyBps > 0
          ? { royalty: { [post.accountId]: resolvedRoyaltyBps } }
          : {}),
        ...(listAppId ? { appId: listAppId } : {}),
        // Video posts have no still to mint — the chosen frame or photo
        // becomes the cover the wallet renders.
        ...(coverFile && !usesPhotoCard ? { image: coverFile } : {}),
        ...(usesGeneratedCard
          ? {
              cardBg: cardTheme.cardBg,
              cardFormat: cardTheme.cardFormat,
              cardPalette: cardTheme.cardPalette,
              cardMarkShape: cardTheme.cardMarkShape,
              cardMarkColor: cardTheme.cardMarkColor,
              cardTitleAlign: cardTheme.cardTitleAlign,
            }
          : {}),
      });
      const confirmed = await trackTransaction({
        txHashes: collectRelayTxHashes(response),
        submittedMessage: txToastConfirming.listingScarce,
        successMessage: txToastSuccess.scarceListed,
        failureMessage: txToastError.listScarceFailed,
      });
      if (!confirmed) return;

      let listingId = extractListingId(response);
      if (!listingId) {
        const live = await findLiveListingForPost(
          accountId,
          post.accountId,
          post.postId
        );
        listingId = live?.listingId;
      }

      invalidateLiveListingsCache(post.accountId);
      const key = postScarceKey(post.accountId, post.postId);
      const coverMedia =
        (usesGeneratedCard ? mintPreviewUrl : null)?.trim() ||
        coverPreviewUrl?.trim() ||
        undefined;
      setScarceEmbedOverride(key, {
        status: 'lazy_listing',
        priceNear,
        copies: editionCount,
        remaining: editionCount,
        ...(listingId ? { listingId } : {}),
        ...(usesGeneratedCard ? { cardBg: cardTheme.cardBg as MoodKey } : {}),
        ...(coverMedia ? { mediaUrl: coverMedia } : {}),
        events: [],
      });
      onSuccess?.({ priceNear, listingId });
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastError.listScarceFailed,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      id={formId}
      className="profile-support-form"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      {showVideoCoverPicker && videoCoverMode === 'frame' && postVideo?.url ? (
        <ScarceVideoFramePicker
          videoUrl={postVideo.url}
          fileName={`post-${post.postId}-cover.jpg`}
          initialSeek={frameSeek}
          disabled={pending}
          onFrame={(file) => {
            frameCoverRef.current = file;
            setCoverFile(file);
          }}
          onSeekCommit={setFrameSeek}
          onError={(message) => {
            setCoverError(message);
            setVideoCoverMode('card');
            setCoverFile(null);
            frameCoverRef.current = null;
          }}
          onPendingChange={setCoverPending}
        />
      ) : (
        <>
          <div
            className={`scarce-list-preview${mintPreviewPending && usesGeneratedCard && !usesPhotoCard ? ' is-pending' : ''}`}
            aria-busy={
              mintPreviewPending && usesGeneratedCard && !usesPhotoCard
            }
          >
            <ScarcePostPreview
              post={post}
              creatorDisplayName={authorName}
              creatorAvatarUrl={creatorAvatarUrl}
              {...(coverPreviewUrl && !usesPhotoCard
                ? { mediaUrl: coverPreviewUrl }
                : mintPreviewUrl && usesGeneratedCard && !usesPhotoCard
                  ? { mediaUrl: mintPreviewUrl }
                  : {})}
              {...(usesGeneratedCard
                ? {
                    cardBg: cardTheme.cardBg,
                    cardFormat: cardTheme.cardFormat,
                    cardMarkShape: cardTheme.cardMarkShape,
                    cardMarkColor: cardTheme.cardMarkColor,
                    cardTitleAlign: cardTheme.cardTitleAlign,
                  }
                : {})}
            />
          </div>
          {mintPreviewError ? (
            <p className="profile-support-error" role="alert">
              {mintPreviewError}
            </p>
          ) : null}
        </>
      )}

      <div className="scarce-mood-picker-block">
        <div
          className="app-storage-presets scarce-choice-chip-row"
          role="group"
          aria-label="Scarce options"
        >
          {hasCoverImage ? (
            <ScarceChoiceField
              label="Artwork"
              value={photoCardFormat}
              disabled={pending}
              options={[
                {
                  value: 'cover' as const,
                  label: 'Original',
                  leading: <ScarceCoverIcon mode="photo" />,
                },
                {
                  value: 'proof' as const,
                  label: 'Proof',
                  leading: <ScarceFormatSwatch format="proof" />,
                },
                {
                  value: 'receipt' as const,
                  label: 'Receipt',
                  leading: <ScarceFormatSwatch format="receipt" />,
                },
              ]}
              chipLeading={
                photoCardFormat === 'cover' ? (
                  <ScarceCoverIcon mode="photo" size="chip" />
                ) : (
                  <ScarceFormatSwatch format={photoCardFormat} size="chip" />
                )
              }
              onChange={(next) => selectPhotoCardFormat(next)}
            />
          ) : null}
          {showMediaCoverPicker ? (
            <ScarceChoiceField
              label="Cover"
              value={
                showAudioCoverPicker && videoCoverMode === 'frame'
                  ? 'card'
                  : videoCoverMode
              }
              disabled={pending || coverPending}
              options={
                showAudioCoverPicker ? AUDIO_COVER_OPTIONS : VIDEO_COVER_OPTIONS
              }
              chipLeading={
                <ScarceCoverIcon
                  mode={
                    showAudioCoverPicker && videoCoverMode === 'frame'
                      ? 'card'
                      : videoCoverMode
                  }
                  size="chip"
                />
              }
              onChange={(next) => selectMediaCoverMode(next)}
            />
          ) : null}
          {usesGeneratedCard ? (
            <ScarceCardMoodPicker
              value={cardTheme}
              onChange={setCardTheme}
              disabled={pending}
              hasPhoto={usesPhotoCard}
              formats={
                usesPhotoCard
                  ? (['receipt', 'proof'] as const)
                  : ([
                      'thought',
                      'poster',
                      'letter',
                      'journal',
                      'mono',
                    ] as const)
              }
            />
          ) : null}
          <ScarceDetailsField
            title={mintTitle}
            description={mintBody}
            disabled={pending}
          />
        </div>
        {showMediaCoverPicker ? (
          <>
            {/*
              Keep the native file control off-screen. `sr-only` alone still
              paints "No file chosen" in some WebKit builds.
            */}
            <input
              ref={coverPhotoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="scarce-cover-file-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending}
              onChange={onCoverPhotoChange}
            />
            {videoCoverMode === 'photo' && coverFile ? (
              <button
                type="button"
                className="os-surface-chip scarce-cover-upload"
                disabled={pending}
                onClick={() => coverPhotoInputRef.current?.click()}
              >
                Change photo
              </button>
            ) : null}
            {coverPending || coverError || videoCoverMode === 'frame' ? (
              <p className="scarce-mood-picker-hint">
                {coverPending
                  ? 'Grabbing a frame…'
                  : (coverError ?? 'Drag to pick the cover frame.')}
              </p>
            ) : null}
          </>
        ) : null}
      </div>

      {storeOptions.length > 0 ? (
        <div className="scarce-royalty-field">
          <p className="scarce-mood-picker-label">List to hub</p>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Hub for this listing"
          >
            <button
              type="button"
              className={`os-surface-chip${!listAppId ? ' is-selected' : ''}`}
              disabled={pending}
              onClick={() => setListAppId('')}
            >
              No hub
            </button>
            {storeOptions.map((store) => (
              <button
                key={store.appId}
                type="button"
                className={`os-surface-chip${
                  listAppId === store.appId ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setListAppId(store.appId)}
              >
                {store.title}
              </button>
            ))}
          </div>
          <p className="scarce-mood-picker-hint">
            Optional. Ties this listing to a storefront for Market filters.
          </p>
        </div>
      ) : null}

      <div className="scarce-royalty-field">
        <p className="scarce-mood-picker-label">Price</p>
        <div className="app-storage-amount-field profile-support-amount-field">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountInput}
            onChange={(event) => applyAmountInput(event.target.value)}
            onFocus={onAmountFocus}
            onBlur={() =>
              applyAmountInput(
                finalizeAmountInput(amountInput, NEAR_INPUT_DECIMALS)
              )
            }
            placeholder={MIN_PRICE_NEAR}
            aria-label="Price in NEAR"
            aria-invalid={Boolean(amountError)}
            className="app-storage-amount-input"
            disabled={pending}
          />
          <span className="account-card-balance-unit profile-support-token-unit">
            NEAR
          </span>
        </div>
        <div
          className="app-storage-presets"
          role="group"
          aria-label="Quick prices"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`os-surface-chip${
                normalizedAmount === preset ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => applyAmountInput(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      <div className="scarce-royalty-field">
        <p className="scarce-mood-picker-label">Copies</p>
        <div
          className="app-storage-presets"
          role="group"
          aria-label="Number of copies"
        >
          {COPIES_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`os-surface-chip${
                !isCustomCopies && copies === preset ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => {
                setCopies(preset);
                setIsCustomCopies(false);
              }}
            >
              {preset === 1 ? '1' : String(preset)}
            </button>
          ))}
          <button
            type="button"
            className={`os-surface-chip${isCustomCopies ? ' is-selected' : ''}`}
            disabled={pending}
            onClick={() => setIsCustomCopies(true)}
          >
            {isCustomCopies && customCopiesInput
              ? `Custom · ${customCopiesInput}`
              : 'Custom'}
          </button>
        </div>
        {isCustomCopies ? (
          <div className="app-storage-amount-field profile-support-amount-field">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={customCopiesInput}
              onChange={(event) =>
                setCustomCopiesInput((current) => {
                  const next = event.target.value
                    .replace(/[^\d]/g, '')
                    .replace(/^0+(?=\d)/, '');
                  if (!next) return '';
                  const value = Number(next);
                  return value >= MIN_COPIES && value <= MAX_COPIES
                    ? next
                    : current;
                })
              }
              placeholder="1–100"
              aria-label="Custom number of copies"
              className="app-storage-amount-input"
              disabled={pending}
            />
            <span className="account-card-balance-unit profile-support-token-unit">
              editions
            </span>
          </div>
        ) : null}
        <p className="profile-support-hint scarce-royalty-hint">
          {editionCount === 1
            ? 'One buyer gets the scarce.'
            : editionCount
              ? `${editionCount} editions — available until sold out or you cancel.`
              : 'Custom editions.'}
        </p>
      </div>

      <div className="scarce-royalty-field">
        <p className="scarce-mood-picker-label">Resale royalty</p>
        <div
          className="app-storage-presets"
          role="group"
          aria-label="Resale royalty"
        >
          {ROYALTY_PRESETS.map((preset) => (
            <button
              key={preset.bps}
              type="button"
              className={`os-surface-chip${
                !isCustomRoyalty && royaltyBps === preset.bps
                  ? ' is-selected'
                  : ''
              }`}
              disabled={pending}
              onClick={() => {
                setRoyaltyBps(preset.bps);
                setIsCustomRoyalty(false);
              }}
            >
              {preset.percent === 0 ? 'None' : `${preset.percent}%`}
            </button>
          ))}
          <button
            type="button"
            className={`os-surface-chip${isCustomRoyalty ? ' is-selected' : ''}`}
            disabled={pending}
            onClick={() => setIsCustomRoyalty(true)}
          >
            {isCustomRoyalty && customRoyaltyInput
              ? `Custom · ${customRoyaltyInput}%`
              : 'Custom'}
          </button>
        </div>
        {isCustomRoyalty ? (
          <div className="app-storage-amount-field profile-support-amount-field">
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={customRoyaltyInput}
              onChange={(event) =>
                setCustomRoyaltyInput((current) => {
                  const next = normalizeCustomRoyaltyInput(event.target.value);
                  if (!next) return '';
                  if (next.endsWith('.')) {
                    return Number(next.slice(0, -1)) <= MAX_ROYALTY_BPS / 100
                      ? next
                      : current;
                  }
                  const bps = parseCustomRoyaltyBps(next);
                  return bps == null ? current : formatRoyaltyPercent(bps);
                })
              }
              placeholder="0–50"
              aria-label="Custom resale royalty percentage from 0 to 50"
              className="app-storage-amount-input"
              disabled={pending}
            />
            <span className="account-card-balance-unit profile-support-token-unit">
              %
            </span>
          </div>
        ) : null}
        <p className="profile-support-hint scarce-royalty-hint">
          Keep first sales after 2%.
          {resolvedRoyaltyBps && resolvedRoyaltyBps > 0
            ? ` Author earns ${formatRoyaltyPercent(resolvedRoyaltyBps)}% on resales.`
            : ' No resale cut.'}
        </p>
      </div>

      {fieldError || amountError ? (
        <p className="profile-support-error" role="alert">
          {fieldError ?? amountError}
        </p>
      ) : !isConnected ? (
        <p className="profile-support-hint">Connect to list this post.</p>
      ) : disabledReason ? (
        <p className="profile-support-hint">{disabledReason}</p>
      ) : null}
    </form>
  );
}
