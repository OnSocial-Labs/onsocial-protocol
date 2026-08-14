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
import { osFieldBorderedClassName } from '@onsocial/ui';
import { AmountField } from '@onsocial/ui';
import { SuffixField } from '@onsocial/ui';
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
  buildRoyaltyMap,
  DEFAULT_ROYALTY_BPS,
  defaultRoyaltyShares,
  formatRoyaltyPercent,
  parseCustomRoyaltyBps,
  validateRoyaltyShares,
  type RoyaltySplitShare,
} from '@/features/scarces/scarce-royalty';
import { ScarceRoyaltyField } from '@/features/scarces/scarce-royalty-field';
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
import {
  buildCollectionId,
  randomDropIdSuffix,
} from '@/features/scarces/drop-collection-id';
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
import { STORAGE_DEPOSIT_PRESETS_NEAR } from '@/lib/user-storage-display';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

type FromPostCommerceMode = 'drop' | 'market';

const CREATE_DROP_STORAGE_NEAR = STORAGE_DEPOSIT_PRESETS_NEAR[0];

function slugifyDropTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

const NEAR_INPUT_DECIMALS = 5;
const MIN_PRICE_NEAR = '0.01';
const PRESETS = ['0.1', '1', '5', '10'] as const;

/** Edition size — one listing, N purchases until sold out. */
const COPIES_PRESETS = [1, 5, 10, 25] as const;
const MIN_COPIES = 1;
const MAX_COPIES = 100;
const DEFAULT_COPIES = 1;

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
  /** Nested option / choice drawers above this list sheet. */
  nestZIndex?: number;
}

export function ScarceListForm({
  post,
  formId,
  authorName = null,
  onSuccess,
  onFooterStateChange,
  nestZIndex = 60,
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
  const [royaltyShares, setRoyaltyShares] = useState<RoyaltySplitShare[]>(() =>
    defaultRoyaltyShares(post.accountId)
  );
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
  /** Create Drop (primary) vs quick Market lazy listing. */
  const [commerceMode, setCommerceMode] =
    useState<FromPostCommerceMode>('drop');
  const [seriesInput, setSeriesInput] = useState('');
  const [existingDrops, setExistingDrops] = useState<
    Array<{ collectionId: string; title: string }>
  >([]);
  const [attachCollectionId, setAttachCollectionId] = useState('');
  const dropIdSuffixRef = useRef(randomDropIdSuffix());
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
      setExistingDrops([]);
      setAttachCollectionId('');
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
    void createReadOnlyOnSocialClient()
      .query.scarces.collectionsCurrent({
        creatorId: accountId,
        mintingOnly: true,
        limit: 20,
      })
      .then((rows) => {
        if (cancelled) return;
        setExistingDrops(
          rows.map((row) => ({
            collectionId: row.collectionId,
            title: row.title?.trim() || row.collectionId,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setExistingDrops([]);
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
  // PNG on screen while the next one loads — never fall back to live SVG.
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
    const isDrop = commerceMode === 'drop';
    return {
      visible: true,
      primaryLabel: isConnected
        ? isDrop
          ? attachCollectionId
            ? 'Attach Drop'
            : 'Create Drop'
          : 'List on Market'
        : 'Connect wallet',
      primaryPendingLabel: isDrop ? 'Creating Drop…' : 'Listing…',
      canSubmit: isConnected ? canSubmit : true,
      pending,
      disabled: pending || (isConnected && !canSubmit),
    };
  }, [attachCollectionId, canSubmit, commerceMode, isConnected, pending]);

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
    if (resolvedRoyaltyBps > 0) {
      const shares =
        royaltyShares.length > 0
          ? royaltyShares
          : defaultRoyaltyShares(post.accountId);
      const shareError = validateRoyaltyShares(shares);
      if (shareError) {
        setFieldError(shareError);
        return;
      }
    }

    setPending(true);
    try {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      const key = postScarceKey(post.accountId, post.postId);
      const coverMedia =
        (usesGeneratedCard ? mintPreviewUrl : null)?.trim() ||
        coverPreviewUrl?.trim() ||
        undefined;
      const royaltyOpts =
        resolvedRoyaltyBps > 0
          ? (() => {
              const shares =
                royaltyShares.length > 0
                  ? royaltyShares
                  : defaultRoyaltyShares(post.accountId);
              const royalty = buildRoyaltyMap(resolvedRoyaltyBps, shares);
              return royalty ? { royalty } : {};
            })()
          : {};
      const mediaOpts = {
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
      };

      if (commerceMode === 'drop' && attachCollectionId) {
        const shell = await createReadOnlyOnSocialClient()
          .query.scarces.collectionCurrent(attachCollectionId)
          .catch(() => null);
        setScarceEmbedOverride(key, {
          status: 'drop',
          collectionId: attachCollectionId,
          priceNear,
          copies: editionCount,
          remaining: shell?.remaining ?? editionCount,
          ...(listAppId
            ? { appId: listAppId }
            : shell?.appId?.trim()
              ? { appId: shell.appId.trim() }
              : {}),
          ...(coverMedia ? { mediaUrl: coverMedia } : {}),
          events: [],
        });
        onSuccess?.({ priceNear, listingId: undefined });
        return;
      }

      if (commerceMode === 'drop') {
        const slug =
          slugifyDropTitle(mintTitle) || `post-${post.postId}`.slice(0, 48);
        const collectionId = buildCollectionId(slug, dropIdSuffixRef.current);
        const seriesId = slugifyDropTitle(seriesInput);
        const response = await client.scarces.fromPost.createDrop(
          post,
          priceNear,
          {
            collectionId,
            copies: editionCount,
            ...royaltyOpts,
            ...(listAppId ? { appId: listAppId } : {}),
            ...mediaOpts,
            ...(seriesId
              ? { series: { id: seriesId, title: seriesInput.trim() } }
              : {}),
            depositYocto: nearToYocto(CREATE_DROP_STORAGE_NEAR),
          }
        );
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.creatingCollection,
          successMessage: txToastSuccess.collectionCreated,
          failureMessage: txToastError.createCollectionFailed,
        });
        if (!confirmed) return;

        setScarceEmbedOverride(key, {
          status: 'drop',
          collectionId,
          priceNear,
          copies: editionCount,
          remaining: editionCount,
          ...(listAppId ? { appId: listAppId } : {}),
          ...(seriesId ? { seriesId } : {}),
          ...(seriesInput.trim() ? { seriesTitle: seriesInput.trim() } : {}),
          ...(usesGeneratedCard ? { cardBg: cardTheme.cardBg as MoodKey } : {}),
          ...(coverMedia ? { mediaUrl: coverMedia } : {}),
          events: [],
        });
        onSuccess?.({ priceNear, listingId: undefined });
        return;
      }

      // Quick Market ask — mint-on-purchase lazy listing (not a Drop).
      const response = await client.scarces.fromPost.list(post, priceNear, {
        copies: editionCount,
        ...royaltyOpts,
        ...(listAppId ? { appId: listAppId } : {}),
        ...mediaOpts,
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
      setScarceEmbedOverride(key, {
        status: 'lazy_listing',
        priceNear,
        copies: editionCount,
        remaining: editionCount,
        ...(listingId ? { listingId } : {}),
        ...(listAppId ? { appId: listAppId } : {}),
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
            : commerceMode === 'drop'
              ? txToastError.createCollectionFailed
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
            {usesGeneratedCard &&
            !usesPhotoCard &&
            !mintPreviewUrl &&
            !coverPreviewUrl ? (
              <div className="scarce-list-preview-placeholder" aria-hidden />
            ) : (
              <ScarcePostPreview
                post={post}
                creatorDisplayName={authorName}
                creatorAvatarUrl={creatorAvatarUrl}
                disableLiveSvg={Boolean(
                  coverPreviewUrl ||
                    (mintPreviewUrl && usesGeneratedCard && !usesPhotoCard)
                )}
                {...(coverPreviewUrl && !usesPhotoCard
                  ? { mediaUrl: coverPreviewUrl }
                  : mintPreviewUrl && usesGeneratedCard && !usesPhotoCard
                    ? { mediaUrl: mintPreviewUrl }
                    : {})}
                {...(usesGeneratedCard &&
                (coverPreviewUrl || mintPreviewUrl || usesPhotoCard)
                  ? {
                      cardBg: cardTheme.cardBg,
                      cardFormat: cardTheme.cardFormat,
                      cardMarkShape: cardTheme.cardMarkShape,
                      cardMarkColor: cardTheme.cardMarkColor,
                      cardTitleAlign: cardTheme.cardTitleAlign,
                    }
                  : {})}
              />
            )}
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
          className="app-storage-presets os-choice-chip-row"
          role="group"
          aria-label="Scarce options"
        >
          {hasCoverImage ? (
            <ScarceChoiceField
              label="Artwork"
              value={photoCardFormat}
              disabled={pending}
              zIndex={nestZIndex}
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
              zIndex={nestZIndex}
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
              zIndex={nestZIndex}
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
            zIndex={nestZIndex}
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

      <div className="scarce-royalty-field">
        <p className="scarce-mood-picker-label">Edition type</p>
        <div
          className="app-storage-presets"
          role="group"
          aria-label="Create Drop or list on Market"
        >
          <button
            type="button"
            className={`os-surface-chip${
              commerceMode === 'drop' ? ' is-selected' : ''
            }`}
            disabled={pending}
            onClick={() => setCommerceMode('drop')}
          >
            Create Drop
          </button>
          <button
            type="button"
            className={`os-surface-chip${
              commerceMode === 'market' ? ' is-selected' : ''
            }`}
            disabled={pending}
            onClick={() => {
              setCommerceMode('market');
              setAttachCollectionId('');
            }}
          >
            List on Market
          </button>
        </div>
        <p className="scarce-mood-picker-hint">
          {commerceMode === 'drop'
            ? 'Primary edition on /drops — image becomes art, video becomes video.'
            : 'Quick mint-on-purchase ask on Market. Not a Drop.'}
        </p>
      </div>

      {commerceMode === 'drop' && existingDrops.length > 0 ? (
        <div className="scarce-royalty-field">
          <p className="scarce-mood-picker-label">Attach existing Drop</p>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Attach an existing Drop"
          >
            <button
              type="button"
              className={`os-surface-chip${!attachCollectionId ? ' is-selected' : ''}`}
              disabled={pending}
              onClick={() => setAttachCollectionId('')}
            >
              New Drop
            </button>
            {existingDrops.map((drop) => (
              <button
                key={drop.collectionId}
                type="button"
                className={`os-surface-chip${
                  attachCollectionId === drop.collectionId ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setAttachCollectionId(drop.collectionId)}
              >
                {drop.title}
              </button>
            ))}
          </div>
          <p className="scarce-mood-picker-hint">
            Optional. Link this post’s CTA to a Drop you already have minting.
          </p>
        </div>
      ) : null}

      {commerceMode === 'drop' && !attachCollectionId ? (
        <div className="scarce-royalty-field">
          <p className="scarce-mood-picker-label">Series</p>
          <input
            type="text"
            autoComplete="off"
            value={seriesInput}
            onChange={(event) => setSeriesInput(event.target.value)}
            placeholder="Optional series name"
            aria-label="Series name"
            className={osFieldBorderedClassName}
            disabled={pending}
          />
          <p className="scarce-mood-picker-hint">
            Soft branding across Drops. Leave blank for a standalone Drop.
          </p>
        </div>
      ) : null}

      {storeOptions.length > 0 ? (
        <div className="scarce-royalty-field">
          <p className="scarce-mood-picker-label">
            {commerceMode === 'drop' ? 'Hub' : 'List to hub'}
          </p>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Hub for this edition"
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
            {commerceMode === 'drop'
              ? 'Optional. Ties this Drop to a storefront.'
              : 'Optional. Ties this listing to a storefront for Market filters.'}
          </p>
        </div>
      ) : null}

      <div className="scarce-royalty-field">
        <p className="scarce-mood-picker-label">Price</p>
        <AmountField
          value={amountInput}
          onValueChange={applyAmountInput}
          maxDecimals={NEAR_INPUT_DECIMALS}
          onFocus={onAmountFocus}
          placeholder={MIN_PRICE_NEAR}
          aria-label="Price in NEAR"
          invalid={Boolean(amountError)}
          unit="NEAR"
          disabled={pending}
        />
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
          <SuffixField
            chrome="bordered"
            value={customCopiesInput}
            onValueChange={(value) =>
              setCustomCopiesInput((current) => {
                const next = value
                  .replace(/[^\d]/g, '')
                  .replace(/^0+(?=\d)/, '');
                if (!next) return '';
                const parsed = Number(next);
                return parsed >= MIN_COPIES && parsed <= MAX_COPIES
                  ? next
                  : current;
              })
            }
            placeholder="1–100"
            aria-label="Custom number of copies"
            suffix="editions"
            disabled={pending}
          />
        ) : null}
        <p className="profile-support-hint scarce-royalty-hint">
          {editionCount === 1
            ? 'One buyer gets the scarce.'
            : editionCount
              ? `${editionCount} editions — available until sold out or you cancel.`
              : 'Custom editions.'}
        </p>
      </div>

      <ScarceRoyaltyField
        royaltyBps={royaltyBps}
        isCustomRoyalty={isCustomRoyalty}
        customRoyaltyInput={customRoyaltyInput}
        pending={pending}
        primaryAccountId={post.accountId}
        shares={royaltyShares}
        onSharesChange={setRoyaltyShares}
        splitZIndex={nestZIndex}
        hint={`Keep first sales after 2%.${
          resolvedRoyaltyBps && resolvedRoyaltyBps > 0
            ? royaltyShares.length > 1
              ? ` ${formatRoyaltyPercent(resolvedRoyaltyBps)}% on resales · split ${royaltyShares.length} accounts.`
              : ` Author earns ${formatRoyaltyPercent(resolvedRoyaltyBps)}% on resales.`
            : ' No resale cut.'
        }`}
        onRoyaltyBpsChange={setRoyaltyBps}
        onCustomRoyaltyChange={setCustomRoyaltyInput}
        onCustomToggle={setIsCustomRoyalty}
      />

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
