'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  OsSheetAction,
  OsSheetActions,
  QuestionMarkCircleFillIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { InfoDrawer } from '@/components/ui/info-drawer';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';
import {
  CollectionAllowlistSheet,
  type AllowlistEntry,
} from '@/features/scarces/collection-allowlist-manager';
import {
  DropArtworkPreview,
  DropSeatTile,
} from '@/features/scarces/drop-artwork-preview';
import {
  buildCollectionId,
  randomDropIdSuffix,
} from '@/features/scarces/drop-collection-id';
import {
  DROP_AUDIO_MAX_BYTES,
  DROP_AUDIO_MAX_TRACKS,
  isDropAudioMime,
  musicTracksValid,
  sha256BlobBase64,
  trackTitleFromFile,
  type MusicReleaseFormat,
} from '@/features/scarces/drop-audio';
import { DropTrackPreviewList } from '@/features/scarces/drop-track-preview-list';
import {
  DROP_WRITING_MAX_BYTES,
  DROP_WRITING_MAX_CHAPTERS,
  buildWritingManifest,
  chaptersFromPinnedFiles,
  isDropWritingMime,
  writingChaptersValid,
  type WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { DropChapterPreviewList } from '@/features/scarces/drop-chapter-preview-list';
import {
  DROP_TEMPLATES,
  type DropTemplate,
  type DropTemplateId,
} from '@/features/scarces/drop-templates';
import { buildVariationSetZip } from '@/features/scarces/variation-set-zip';
import type { GenerativeLayerSpec } from '@onsocial/sdk';
import {
  GenerativeDropBuilder,
  type BuilderDesignSummary,
  type GeneratedSet,
  type GenerativeBuilderHandle,
} from '@/features/scarces/generative-drop-builder';
import { GenerativeStudioHelpDrawer } from '@/features/scarces/generative-studio-help-drawer';
import {
  DropSaleWindowSheet,
  formatScheduleLabel,
  localDateTimeToMs,
  localDateTimeToNs,
  type SaleWindowField,
} from '@/features/scarces/drop-sale-window-sheet';
import {
  buildRoyaltyMap,
  DEFAULT_ROYALTY_BPS,
  defaultRoyaltyShares,
  parseCustomRoyaltyBps,
  validateRoyaltyShares,
  type RoyaltySplitShare,
} from '@/features/scarces/scarce-royalty';
import { ScarceRoyaltyField } from '@/features/scarces/scarce-royalty-field';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { nearToYocto } from '@/lib/app-near-rpc';
import {
  APP_MARKET_PATH,
  MARKET_APP_PARAM,
  appPath,
  collectionPath,
} from '@/lib/app-routes';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import { STORAGE_DEPOSIT_PRESETS_NEAR } from '@/lib/user-storage-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const NEAR_INPUT_DECIMALS = 5;
const SUPPLY_PRESETS = [10, 25, 100, 500] as const;
/** Same order as storage / list forms: amount first, numeric chips below. */
const PRICE_PRESETS = ['0', '0.1', '1', '5'] as const;
const MIN_SUPPLY = 1;
const MAX_SUPPLY = 10_000;
const MIN_VARIATIONS = 2;
/**
 * Direct-attach ceiling: sets up to this size ride along with the create
 * request and get the tap-to-pick cover grid. Bigger sets are zipped in the
 * browser, pinned via the gateway, and created by CID.
 */
const MAX_VARIATIONS = 50;
/** Client pinning path ceiling — matches the gateway archive cap. */
const MAX_SET_PIECES = 10_000;
/** Keep the in-browser zip from exhausting memory on huge selections. */
const MAX_SET_TOTAL_BYTES = 400 * 1024 * 1024;
/** Object URLs created for a large set — enough to preview, not the DOM. */
const LARGE_SET_PREVIEW_LIMIT = 24;
const MAX_TITLE = 80;
/** Attached on create so scarces can fund storage; unused NEAR is refunded. */
const CREATE_STORAGE_BUFFER_NEAR = STORAGE_DEPOSIT_PRESETS_NEAR[0];
const MAX_DESCRIPTION = 1000;

/** One shared artwork minted N times, or one artwork per token. */
type DropArtMode = 'single' | 'variations';

/** Variation art source: direct upload, a pre-pinned IPFS directory, or the in-app generator. */
type VariationSource = 'upload' | 'cid' | 'generate';

/** Seat-file extension inside a pinned variation directory. */
type VariationExt = 'png' | 'jpg' | 'webp' | 'gif';

/** Loose CID shape check — base58 / base32 CIDs are ≥32 alphanumerics. */
function looksLikeCid(value: string): boolean {
  return /^[A-Za-z0-9]{32,}$/.test(value);
}

function fieldId(name: string) {
  return `drop-create-${name}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function CreateDropPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appId = searchParams.get(MARKET_APP_PARAM)?.trim() ?? '';
  const { accountId, isConnected, isLoading, connect, getSigningWallet } =
    useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [templateId, setTemplateId] = useState<DropTemplateId>('art');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  /** Fixed for this form session — keeps the public-link preview honest. */
  const [idSuffix] = useState(() => randomDropIdSuffix());
  const [description, setDescription] = useState('');
  const [supplyInput, setSupplyInput] = useState('25');
  const [priceInput, setPriceInput] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [accessEnds, setAccessEnds] = useState('');
  const [scheduleField, setScheduleField] = useState<SaleWindowField | null>(
    null
  );
  const [maxPerWallet, setMaxPerWallet] = useState('');
  const [royaltyBps, setRoyaltyBps] = useState(DEFAULT_ROYALTY_BPS);
  const [isCustomRoyalty, setIsCustomRoyalty] = useState(false);
  const [customRoyaltyInput, setCustomRoyaltyInput] = useState('');
  const [royaltyShares, setRoyaltyShares] = useState<RoyaltySplitShare[]>([]);
  const [transferable, setTransferable] = useState(true);
  const [renewable, setRenewable] = useState(false);
  const [maxRedeemsInput, setMaxRedeemsInput] = useState('');
  const [draftAllowlist, setDraftAllowlist] = useState<AllowlistEntry[]>([]);
  const [allowlistSheetOpen, setAllowlistSheetOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [artMode, setArtMode] = useState<DropArtMode>('single');
  const [musicFormat, setMusicFormat] = useState<MusicReleaseFormat>('single');
  const [trackFiles, setTrackFiles] = useState<File[]>([]);
  const [writingFormat, setWritingFormat] =
    useState<WritingReleaseFormat>('article');
  const [chapterFiles, setChapterFiles] = useState<File[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [variationFiles, setVariationFiles] = useState<File[]>([]);
  const [variationPreviews, setVariationPreviews] = useState<string[]>([]);
  const [variationSource, setVariationSource] =
    useState<VariationSource>('upload');
  const [variationsCid, setVariationsCid] = useState('');
  const [variationsExt, setVariationsExt] = useState<VariationExt>('png');
  /** 1-based piece number shown as the drop's cover in the market. */
  const [coverSeatInput, setCoverSeatInput] = useState('1');
  const [traitsCid, setTraitsCid] = useState('');
  const [randomAssign, setRandomAssign] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  const [generatedPreviews, setGeneratedPreviews] = useState<string[]>([]);
  /** Full-screen layer studio step — the builder stays mounted underneath. */
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioHelpOpen, setStudioHelpOpen] = useState(false);
  const [design, setDesign] = useState<BuilderDesignSummary | null>(null);
  const builderRef = useRef<GenerativeBuilderHandle>(null);
  const [seriesName, setSeriesName] = useState('');
  const [pending, setPending] = useState(false);
  /** Upload pins first (album tracks); wallet sign stays a separate label. */
  const [pendingLabel, setPendingLabel] = useState('Starting…');
  /**
   * Heavy pins finished — next submit only opens the wallet. A second click
   * keeps the user gesture so the approve sheet actually pops.
   */
  const [pinnedMusic, setPinnedMusic] = useState<{
    playable: Array<{ cid: string; mime: string; title?: string }>;
    coverCid: string;
    coverHash: string;
  } | null>(null);
  const [pinnedWriting, setPinnedWriting] = useState<{
    writingManifestCid: string;
    writingFormat: WritingReleaseFormat;
    chapterCount: number;
    coverCid: string;
    coverHash: string;
  } | null>(null);
  const [pinnedLargeSet, setPinnedLargeSet] = useState<{
    cid: string;
    ext: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const tracksInputRef = useRef<HTMLInputElement>(null);
  const chaptersInputRef = useRef<HTMLInputElement>(null);
  const variationsInputRef = useRef<HTMLInputElement>(null);
  /** Replace wipes the set; append adds to the end (same format). */
  const variationPickModeRef = useRef<'replace' | 'append'>('replace');
  const variationFilesRef = useRef(variationFiles);
  variationFilesRef.current = variationFiles;
  const errorRef = useRef<HTMLParagraphElement>(null);
  const toolbarHidden = useDockAutoHide();

  // Invalidate pins if the creator changes files after prepare.
  useEffect(() => {
    setPinnedMusic(null);
  }, [trackFiles, imageFile, musicFormat]);

  useEffect(() => {
    setPinnedWriting(null);
  }, [chapterFiles, imageFile, writingFormat]);

  useEffect(() => {
    setPinnedLargeSet(null);
  }, [variationFiles]);

  const template =
    DROP_TEMPLATES.find((entry) => entry.id === templateId) ??
    DROP_TEMPLATES[0];

  // The submit action lives in the header, so bring failures into view.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const applyTemplate = useCallback((next: DropTemplate) => {
    setTemplateId(next.id);
    if (next.presets) {
      setTransferable(next.presets.transferable);
      setRenewable(next.presets.renewable);
      setMaxRedeemsInput(next.presets.maxRedeems);
      if (!next.presets.renewable) setAccessEnds('');
    }
    if (next.openAdvanced) setShowAdvanced(true);
    if (next.id === 'music') {
      setArtMode('single');
      setMusicFormat('single');
    }
    if (next.id === 'writing') {
      setArtMode('single');
      setWritingFormat('article');
    }
    setError(null);
  }, []);

  const isMusic = templateId === 'music';
  const isWriting = templateId === 'writing';
  const isVariations = !isMusic && !isWriting && artMode === 'variations';
  const isPinnedSet = isVariations && variationSource === 'cid';
  const isGeneratedSet = isVariations && variationSource === 'generate';
  /** Upload too big to attach directly — zipped and pinned at submit. */
  const isLargeUpload =
    isVariations &&
    variationSource === 'upload' &&
    variationFiles.length > MAX_VARIATIONS;
  const derivedSlug = useMemo(() => slugify(slug || title), [slug, title]);
  const collectionId = useMemo(
    () =>
      derivedSlug.length >= 3 ? buildCollectionId(derivedSlug, idSuffix) : '',
    [derivedSlug, idSuffix]
  );
  const editionSupply = Number.parseInt(supplyInput, 10);
  const supply =
    isVariations && !isPinnedSet ? variationFiles.length : editionSupply;
  const price = finalizeAmountInput(priceInput, NEAR_INPUT_DECIMALS);
  const supplyValid =
    isVariations && !isPinnedSet
      ? variationFiles.length >= MIN_VARIATIONS &&
        variationFiles.length <= MAX_SET_PIECES
      : Number.isSafeInteger(editionSupply) &&
        editionSupply >= (isPinnedSet ? MIN_VARIATIONS : MIN_SUPPLY) &&
        editionSupply <= MAX_SUPPLY;
  const pinnedCidValid = looksLikeCid(variationsCid.trim());
  const traitsCidValid = !traitsCid.trim() || looksLikeCid(traitsCid.trim());
  const maxRedeems = Number.parseInt(maxRedeemsInput, 10);
  const maxRedeemsValid =
    !maxRedeemsInput.trim() ||
    (Number.isSafeInteger(maxRedeems) && maxRedeems >= 1);
  const coverSeat = Number.parseInt(coverSeatInput, 10);
  const coverSeatValid =
    !isVariations ||
    (Number.isSafeInteger(coverSeat) &&
      coverSeat >= 1 &&
      (!supplyValid || coverSeat <= supply));

  const tracksReady =
    !isMusic || musicTracksValid(musicFormat, trackFiles.length);
  const chaptersReady =
    !isWriting || writingChaptersValid(writingFormat, chapterFiles.length);
  const customRoyaltyBps = parseCustomRoyaltyBps(customRoyaltyInput);
  const resolvedRoyaltyBps = isCustomRoyalty ? customRoyaltyBps : royaltyBps;
  const resolvedRoyaltyShares =
    royaltyShares.length > 0
      ? royaltyShares
      : defaultRoyaltyShares(accountId ?? '');
  const canSubmit =
    isConnected &&
    !pending &&
    title.trim().length >= 2 &&
    derivedSlug.length >= 3 &&
    supplyValid &&
    maxRedeemsValid &&
    traitsCidValid &&
    coverSeatValid &&
    tracksReady &&
    chaptersReady &&
    resolvedRoyaltyBps != null &&
    (isVariations
      ? isPinnedSet
        ? pinnedCidValid
        : variationFiles.length >= MIN_VARIATIONS
      : imageFile != null);

  const onImageChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Image must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const onTracksChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (picked.length === 0) return;
      for (const file of picked) {
        if (!isDropAudioMime(file.type)) {
          setError('Use MP3, M4A, WAV, or another audio file.');
          return;
        }
        if (file.size > DROP_AUDIO_MAX_BYTES) {
          setError('Each track must be 20 MB or smaller.');
          return;
        }
      }
      setError(null);
      setTrackFiles((prev) => {
        if (musicFormat === 'single') {
          return picked.slice(0, 1);
        }
        const next = [...prev, ...picked].slice(0, DROP_AUDIO_MAX_TRACKS);
        return next;
      });
    },
    [musicFormat]
  );

  const removeTrackAt = useCallback((index: number) => {
    setTrackFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorderTracks = useCallback((next: File[]) => {
    setTrackFiles(next);
  }, []);

  const setMusicReleaseFormat = useCallback((format: MusicReleaseFormat) => {
    setMusicFormat(format);
    if (format === 'single') {
      setTrackFiles((prev) => prev.slice(0, 1));
    }
    setError(null);
  }, []);

  const onChaptersChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (picked.length === 0) return;
      for (const file of picked) {
        if (!isDropWritingMime(file.type, file.name)) {
          setError('Use Markdown (.md) or plain text (.txt) files.');
          return;
        }
        if (file.size > DROP_WRITING_MAX_BYTES) {
          setError('Each chapter must be 500 KB or smaller.');
          return;
        }
      }
      setError(null);
      setChapterFiles((prev) => {
        if (writingFormat === 'article') {
          return picked.slice(0, 1);
        }
        return [...prev, ...picked].slice(0, DROP_WRITING_MAX_CHAPTERS);
      });
    },
    [writingFormat]
  );

  const removeChapterAt = useCallback((index: number) => {
    setChapterFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorderChapters = useCallback((next: File[]) => {
    setChapterFiles(next);
  }, []);

  const setWritingReleaseFormat = useCallback(
    (format: WritingReleaseFormat) => {
      setWritingFormat(format);
      if (format === 'article') {
        setChapterFiles((prev) => prev.slice(0, 1));
      }
      setError(null);
    },
    []
  );

  const syncVariationPreviews = useCallback((files: File[]) => {
    setVariationPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      // Big sets preview a sample — object URLs for 10k files would hurt.
      return files
        .slice(
          0,
          files.length > MAX_VARIATIONS ? LARGE_SET_PREVIEW_LIMIT : undefined
        )
        .map((file) => URL.createObjectURL(file));
    });
  }, []);

  const openVariationPicker = useCallback((mode: 'replace' | 'append') => {
    variationPickModeRef.current = mode;
    variationsInputRef.current?.click();
  }, []);

  const onVariationsChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (picked.length === 0) return;

      const mode = variationPickModeRef.current;
      variationPickModeRef.current = 'replace';
      const existing = variationFilesRef.current;
      const next = mode === 'append' ? [...existing, ...picked] : picked;

      if (next.length < MIN_VARIATIONS || next.length > MAX_SET_PIECES) {
        setError(
          mode === 'append'
            ? `Sets hold ${MIN_VARIATIONS}–${MAX_SET_PIECES.toLocaleString()} images — this would be ${next.length.toLocaleString()}.`
            : `Pick ${MIN_VARIATIONS}–${MAX_SET_PIECES.toLocaleString()} images — one per piece.`
        );
        return;
      }

      const format = next[0].type;
      let totalBytes = 0;
      for (const file of next) {
        if (!isPostImageMime(file.type)) {
          setError('Use JPG, PNG, or WebP images.');
          return;
        }
        if (file.type !== format) {
          setError('All variation images must share one format.');
          return;
        }
        if (file.size > POST_IMAGE_MAX_BYTES) {
          setError('Each image must be 5 MB or smaller.');
          return;
        }
        totalBytes += file.size;
      }
      if (totalBytes > MAX_SET_TOTAL_BYTES) {
        setError(
          `The whole set must stay under ${Math.floor(MAX_SET_TOTAL_BYTES / (1024 * 1024))} MB — try smaller files.`
        );
        return;
      }

      setError(null);
      setVariationFiles(next);
      syncVariationPreviews(next);
      setCoverSeatInput((prev) => {
        const seat = Number.parseInt(prev, 10);
        return Number.isSafeInteger(seat) && seat >= 1 && seat <= next.length
          ? prev
          : '1';
      });
    },
    [syncVariationPreviews]
  );

  const removeVariationAt = useCallback(
    (index: number) => {
      const existing = variationFilesRef.current;
      if (index < 0 || index >= existing.length) return;
      const next = existing.filter((_, i) => i !== index);
      setVariationFiles(next);
      syncVariationPreviews(next);
      setCoverSeatInput((prev) => {
        const seat = Number.parseInt(prev, 10);
        if (!Number.isSafeInteger(seat) || seat < 1 || next.length === 0) {
          return '1';
        }
        // Seat numbers are 1-based file indices — shift when a lower piece drops.
        if (seat === index + 1) return '1';
        if (seat > index + 1) return String(seat - 1);
        return prev;
      });
      setError(null);
    },
    [syncVariationPreviews]
  );

  const uploadVariationArchives = useCallback(
    async (imagesZip: Blob, traitsZip: Blob) => {
      if (!isConnected) await connect();
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      return client.scarces.collections.uploadVariationSet({
        imagesZip,
        traitsZip,
      });
    },
    [isConnected, connect, getSigningWallet]
  );

  const startServerGeneration = useCallback(
    async (supply: number, layers: GenerativeLayerSpec[]) => {
      if (!isConnected) await connect();
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      return client.scarces.collections.generateVariationSet({
        supply,
        layers,
      });
    },
    [isConnected, connect, getSigningWallet]
  );

  const pollServerGeneration = useCallback(
    async (jobId: string) => {
      const { accountId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(accountId, wallet);
      return client.scarces.collections.generateVariationSetStatus(jobId);
    },
    [getSigningWallet]
  );

  // The generator hands back pinned CIDs — flip to the internal CID source
  // so submit creates the drop from the pinned directories.
  const onGenerated = useCallback((result: GeneratedSet) => {
    setVariationsCid(result.artCid);
    setTraitsCid(result.traitsCid);
    setVariationsExt('png');
    setSupplyInput(String(result.count));
    setCoverSeatInput('1');
    setRandomAssign(true);
    setGeneratedNote(
      `Set generated and pinned — ${result.count} pieces. Art and trait CIDs are filled in below.`
    );
    setGeneratedPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return result.previews;
    });
    setVariationSource('cid');
    setStudioOpen(false);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      if (!isConnected) {
        await connect();
        return;
      }
      if (isVariations && isPinnedSet && !pinnedCidValid) {
        setError('Paste the IPFS folder CID of your pinned set.');
        return;
      }
      if (
        isVariations &&
        !isPinnedSet &&
        variationFiles.length < MIN_VARIATIONS
      ) {
        setError(
          `Add ${MIN_VARIATIONS}–${MAX_VARIATIONS} images — one per piece.`
        );
        return;
      }
      if (!isVariations && !imageFile) {
        setError(
          isMusic
            ? 'Add cover art for the release.'
            : 'Add artwork for the drop.'
        );
        return;
      }
      if (isMusic && !musicTracksValid(musicFormat, trackFiles.length)) {
        setError(
          musicFormat === 'single'
            ? 'Add one track for this single.'
            : `Add 2–${DROP_AUDIO_MAX_TRACKS} tracks for an album.`
        );
        return;
      }
      if (!traitsCidValid) {
        setError('The traits folder CID doesn’t look like an IPFS CID.');
        return;
      }
      if (!supplyValid) {
        setError(
          isVariations && !isPinnedSet
            ? `Variation sets are ${MIN_VARIATIONS}–${MAX_SET_PIECES.toLocaleString()} pieces.`
            : isPinnedSet
              ? `Supply must be between ${MIN_VARIATIONS} and ${MAX_SUPPLY}.`
              : `Supply must be between ${MIN_SUPPLY} and ${MAX_SUPPLY}.`
        );
        return;
      }
      if (!maxRedeemsValid) {
        setError('Max redeems must be a positive whole number.');
        return;
      }
      if (!coverSeatValid) {
        setError(`Cover piece must be between 1 and ${supply}.`);
        return;
      }
      if (!canSubmit) {
        setError('Add a title, cover art, and supply to start the drop.');
        return;
      }
      if (template.requiresEndTime && !endTime) {
        setError(
          'Set when sales close in Sale window — tickets need an event date.'
        );
        return;
      }
      if (template.requiresAccessEnd && !(renewable && accessEnds)) {
        setError(
          `Set when access ends — ${template.unit} need an expiry date.`
        );
        return;
      }

      const startNs = localDateTimeToNs(startTime);
      const endNs = localDateTimeToNs(endTime);
      const expiresAtMs =
        renewable && accessEnds ? localDateTimeToMs(accessEnds) : undefined;
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      if (startNs && BigInt(startNs) <= nowNs) {
        setError('The open time must be in the future. Clear it for Now.');
        return;
      }
      if (endNs && BigInt(endNs) <= nowNs) {
        setError('The close time must be in the future.');
        return;
      }
      if (startNs && endNs && BigInt(endNs) <= BigInt(startNs)) {
        setError('The close time must be after the open time.');
        return;
      }
      if (expiresAtMs != null && expiresAtMs <= Date.now()) {
        setError('Access end must be in the future.');
        return;
      }
      if (resolvedRoyaltyBps == null) {
        setError('Enter a royalty between 0 and 50%.');
        return;
      }
      if (resolvedRoyaltyBps > 0) {
        const shareError = validateRoyaltyShares(resolvedRoyaltyShares);
        if (shareError) {
          setError(shareError);
          return;
        }
      }
      if (draftAllowlist.length > 0 && !startTime.trim()) {
        setError(
          'Set Opens in Sale window so the allowlist can mint early — or clear the list.'
        );
        return;
      }
      const perWallet = Number.parseInt(maxPerWallet, 10);

      const trimmedSeries = seriesName.trim();
      // Collection-level metadata blob: series grouping plus the chosen
      // cover piece (seat 1 is the display default, so only store overrides).
      const coverOverride =
        isVariations && Number.isSafeInteger(coverSeat) && coverSeat > 1
          ? { cover: { seat: coverSeat } }
          : null;
      const collectionMetadata =
        trimmedSeries || coverOverride
          ? {
              ...(trimmedSeries
                ? {
                    series: {
                      id: slugify(trimmedSeries),
                      title: trimmedSeries,
                    },
                  }
                : {}),
              ...(coverOverride ?? {}),
            }
          : null;

      if (!collectionId) {
        setError('Add a title so OnSocial can build a drop ID.');
        return;
      }

      const uploaderAccountId = accountId?.trim();
      if (!uploaderAccountId) {
        await connect();
        return;
      }

      // Phase 1 — pin heavy media without touching the wallet. The browser
      // drops the click gesture after a long await, so wallet approve must be
      // a separate click (phase 2).
      if (isMusic && !pinnedMusic) {
        setPending(true);
        setPendingLabel(
          trackFiles.length > 1 ? 'Uploading tracks…' : 'Uploading track…'
        );
        try {
          const uploadClient = createAppOnSocialClient(uploaderAccountId);
          const uploaded = await uploadClient.storage.uploadMany(trackFiles);
          const playable = uploaded.map((ref, index) => {
            const file = trackFiles[index]!;
            const trackTitle = trackTitleFromFile(file);
            return {
              cid: ref.cid,
              mime: file.type || 'audio/mpeg',
              ...(trackTitle ? { title: trackTitle } : {}),
            };
          });
          setPendingLabel('Uploading cover…');
          const cover = await uploadClient.storage.upload(imageFile!);
          const coverHash = await sha256BlobBase64(imageFile!);
          setPinnedMusic({
            playable,
            coverCid: cover.cid,
            coverHash,
          });
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : txToastError.createCollectionFailed
          );
        } finally {
          setPending(false);
          setPendingLabel('Starting…');
        }
        return;
      }

      if (isWriting && !pinnedWriting) {
        setPending(true);
        setPendingLabel(
          chapterFiles.length > 1
            ? 'Uploading chapters…'
            : 'Uploading manuscript…'
        );
        try {
          const uploadClient = createAppOnSocialClient(uploaderAccountId);
          const uploaded = await uploadClient.storage.uploadMany(chapterFiles);
          const chapters = chaptersFromPinnedFiles(chapterFiles, uploaded);
          setPendingLabel('Uploading manifesto…');
          const manifesto = buildWritingManifest({
            title: title.trim() || undefined,
            chapters,
          });
          const manifestoPinned =
            await uploadClient.storage.uploadJson(manifesto);
          setPendingLabel('Uploading cover…');
          const cover = await uploadClient.storage.upload(imageFile!);
          const coverHash = await sha256BlobBase64(imageFile!);
          setPinnedWriting({
            writingManifestCid: manifestoPinned.cid,
            writingFormat,
            chapterCount: chapters.length,
            coverCid: cover.cid,
            coverHash,
          });
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : txToastError.createCollectionFailed
          );
        } finally {
          setPending(false);
          setPendingLabel('Starting…');
        }
        return;
      }

      if (isLargeUpload && !pinnedLargeSet) {
        setPending(true);
        setPendingLabel('Uploading set…');
        try {
          const uploadClient = createAppOnSocialClient(uploaderAccountId);
          const { imagesZip } = await buildVariationSetZip(variationFiles);
          const pinned =
            await uploadClient.scarces.collections.uploadVariationSet({
              imagesZip,
            });
          setPinnedLargeSet({
            cid: pinned.variations.cid,
            ext: pinned.variations.ext,
          });
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : txToastError.createCollectionFailed
          );
        } finally {
          setPending(false);
          setPendingLabel('Starting…');
        }
        return;
      }

      // Phase 2 — user just clicked again; open wallet + sign immediately.
      setPending(true);
      setPendingLabel('Confirm in wallet…');
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(signerId, wallet);

        const response = await client.scarces.collections.create(
          {
            collectionId,
            totalSupply: supply,
            title: title.trim(),
            ...(isVariations
              ? isPinnedSet
                ? {
                    variationsCid: variationsCid.trim(),
                    ...(variationsExt !== 'png' ? { variationsExt } : {}),
                  }
                : pinnedLargeSet
                  ? {
                      variationsCid: pinnedLargeSet.cid,
                      ...(pinnedLargeSet.ext !== 'png'
                        ? { variationsExt: pinnedLargeSet.ext }
                        : {}),
                    }
                  : { images: variationFiles }
              : pinnedMusic
                ? {
                    mediaCid: pinnedMusic.coverCid,
                    mediaHash: pinnedMusic.coverHash,
                  }
                : pinnedWriting
                  ? {
                      mediaCid: pinnedWriting.coverCid,
                      mediaHash: pinnedWriting.coverHash,
                    }
                  : { image: imageFile! }),
            ...(isPinnedSet && traitsCid.trim()
              ? { referenceCid: traitsCid.trim() }
              : {}),
            ...(isVariations && randomAssign ? { randomAssignment: true } : {}),
            transferable,
            renewable,
            extra: {
              ...(template.kind ? { kind: template.kind } : {}),
              ...(pinnedMusic ? { playable: pinnedMusic.playable } : {}),
              ...(pinnedWriting
                ? {
                    writingFormat: pinnedWriting.writingFormat,
                    writingManifest: pinnedWriting.writingManifestCid,
                    chapterCount: pinnedWriting.chapterCount,
                  }
                : {}),
            },
            ...(collectionMetadata ? { metadata: collectionMetadata } : {}),
            ...(price ? { priceNear: price } : {}),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(startNs ? { startTime: startNs } : {}),
            ...(endNs ? { endTime: endNs } : {}),
            ...(expiresAtMs != null ? { expiresAtMs } : {}),
            ...(Number.isSafeInteger(perWallet) && perWallet > 0
              ? { maxPerWallet: perWallet }
              : {}),
            ...(Number.isSafeInteger(maxRedeems) && maxRedeems >= 1
              ? { maxRedeems }
              : {}),
            ...(resolvedRoyaltyBps > 0
              ? (() => {
                  const royalty = buildRoyaltyMap(
                    resolvedRoyaltyBps,
                    resolvedRoyaltyShares
                  );
                  return royalty ? { royalty } : {};
                })()
              : {}),
            ...(appId ? { appId } : {}),
          },
          { depositYocto: nearToYocto(CREATE_STORAGE_BUFFER_NEAR) }
        );
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.creatingCollection,
          successMessage: txToastSuccess.collectionCreated,
          failureMessage: txToastError.createCollectionFailed,
        });
        if (!confirmed) return;

        if (draftAllowlist.length > 0) {
          setPendingLabel('Saving allowlist…');
          try {
            const allowlistResponse =
              await client.scarces.collections.setAllowlist(
                collectionId,
                draftAllowlist
              );
            const allowlistConfirmed = await trackTransaction({
              txHashes: collectRelayTxHashes(allowlistResponse),
              submittedMessage: txToastConfirming.updatingAllowlist,
              successMessage: txToastSuccess.allowlistUpdated,
              failureMessage: txToastError.updateAllowlistFailed,
            });
            if (!allowlistConfirmed) {
              setTxResult({
                type: 'error',
                msg: 'Drop created — finish the allowlist on the drop page.',
              });
            }
          } catch (allowlistCause) {
            if (!isWalletUserCancellation(allowlistCause)) {
              setTxResult({
                type: 'error',
                msg:
                  allowlistCause instanceof Error
                    ? allowlistCause.message
                    : 'Drop created — finish the allowlist on the drop page.',
              });
            } else {
              setTxResult({
                type: 'error',
                msg: 'Drop created — finish the allowlist on the drop page.',
              });
            }
          }
        }

        setPinnedMusic(null);
        setPinnedWriting(null);
        setPinnedLargeSet(null);
        router.push(collectionPath(collectionId));
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setError(
          cause instanceof Error
            ? cause.message
            : txToastError.createCollectionFailed
        );
      } finally {
        setPending(false);
        setPendingLabel('Starting…');
      }
    },
    [
      isConnected,
      connect,
      imageFile,
      isVariations,
      isPinnedSet,
      isLargeUpload,
      pinnedCidValid,
      variationsCid,
      variationsExt,
      traitsCid,
      traitsCidValid,
      randomAssign,
      variationFiles,
      seriesName,
      supplyValid,
      maxRedeemsValid,
      coverSeat,
      coverSeatValid,
      canSubmit,
      startTime,
      endTime,
      accessEnds,
      maxPerWallet,
      collectionId,
      supply,
      title,
      price,
      description,
      transferable,
      renewable,
      maxRedeems,
      draftAllowlist,
      resolvedRoyaltyBps,
      resolvedRoyaltyShares,
      appId,
      template,
      isMusic,
      musicFormat,
      trackFiles,
      isWriting,
      writingFormat,
      chapterFiles,
      accountId,
      pinnedMusic,
      pinnedWriting,
      pinnedLargeSet,
      getSigningWallet,
      trackTransaction,
      setTxResult,
      router,
    ]
  );

  const needsWalletConfirm =
    (isMusic && pinnedMusic != null) ||
    (isWriting && pinnedWriting != null) ||
    (isLargeUpload && pinnedLargeSet != null);

  return (
    <OsAppScreen
      title={studioOpen ? 'Design your set' : appId || 'Start a drop'}
      backFallbackHref={appId ? appPath(appId) : APP_MARKET_PATH}
      glassChrome
      actions={
        studioOpen ? (
          <>
            <button
              type="button"
              className={osIconActionClassName}
              aria-label="How the layer studio works"
              aria-expanded={studioHelpOpen}
              aria-haspopup="dialog"
              onClick={() => setStudioHelpOpen(true)}
            >
              <QuestionMarkCircleFillIcon aria-hidden />
            </button>
            <OsSheetActions
              layout="row-compact"
              tone="frosted-primary"
              borderless
              className="drop-create-header-cta"
            >
              <OsSheetAction
                variant="primary"
                ready={Boolean(design?.canGenerate)}
                pending={Boolean(design?.working)}
                pendingLabel="Generating…"
                disabled={!design?.canGenerate}
                onClick={() => builderRef.current?.generate()}
              >
                Generate
              </OsSheetAction>
            </OsSheetActions>
          </>
        ) : (
          <>
            <button
              type="button"
              className={osIconActionClassName}
              aria-label={`About ${template.label} drops`}
              aria-expanded={helpOpen}
              aria-haspopup="dialog"
              onClick={() => setHelpOpen(true)}
            >
              <QuestionMarkCircleFillIcon aria-hidden />
            </button>
            <OsSheetActions
              layout="row-compact"
              tone="frosted-primary"
              borderless
              className="drop-create-header-cta"
            >
              <OsSheetAction
                type="submit"
                form={fieldId('form')}
                variant="primary"
                ready={canSubmit || needsWalletConfirm}
                pending={pending}
                pendingLabel={pendingLabel}
                disabled={
                  pending || (isConnected && !canSubmit && !needsWalletConfirm)
                }
              >
                {!isConnected && !isLoading
                  ? 'Connect'
                  : needsWalletConfirm
                    ? 'Confirm in wallet'
                    : 'Start drop'}
              </OsSheetAction>
            </OsSheetActions>
          </>
        )
      }
      toolbar={
        studioOpen ? undefined : (
          <div
            className={`os-app-chrome-rail drop-template-toolbar${
              toolbarHidden ? ' is-scroll-hidden' : ''
            }`}
          >
            <div
              className="discover-tab-bar market-listing-filters"
              role="tablist"
              aria-label="What are you dropping?"
            >
              <div className="discover-tab-bar-scroller">
                {DROP_TEMPLATES.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={templateId === entry.id}
                    className={
                      templateId === entry.id ? 'is-active' : undefined
                    }
                    disabled={pending}
                    onClick={() => applyTemplate(entry)}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      }
      leading={
        studioOpen ? (
          <button
            type="button"
            className={osIconActionClassName}
            aria-label="Back to drop details"
            onClick={() => setStudioOpen(false)}
          >
            <ArrowLeftIcon className="glass-sheet-close-icon" aria-hidden />
          </button>
        ) : undefined
      }
    >
      {/* The studio is hidden (not unmounted) when closed so uploaded layers
          and an in-flight server render survive stepping back to the form. */}
      {isGeneratedSet ? (
        <div
          className="drop-studio"
          style={studioOpen ? undefined : { display: 'none' }}
        >
          <GenerativeDropBuilder
            ref={builderRef}
            disabled={pending}
            upload={uploadVariationArchives}
            remoteStart={startServerGeneration}
            remotePoll={pollServerGeneration}
            onGenerated={onGenerated}
            onDesignChange={setDesign}
          />
        </div>
      ) : null}
      <form
        id={fieldId('form')}
        className="drop-create-form"
        style={studioOpen ? { display: 'none' } : undefined}
        onSubmit={handleSubmit}
      >
        {isMusic ? (
          <div className="guild-field">
            <span>Release</span>
            <div
              className="app-access-options"
              role="radiogroup"
              aria-label="Release format"
            >
              <button
                type="button"
                role="radio"
                aria-checked={musicFormat === 'single'}
                className={`app-access-option${
                  musicFormat === 'single' ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setMusicReleaseFormat('single')}
              >
                Single
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={musicFormat === 'album'}
                className={`app-access-option${
                  musicFormat === 'album' ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setMusicReleaseFormat('album')}
              >
                Album
              </button>
            </div>
            <small>
              {musicFormat === 'single'
                ? 'One cover, one track — every edition shares the same release.'
                : 'One cover for the album · add every track below. Editions share the full release.'}
            </small>
          </div>
        ) : isWriting ? (
          <div className="guild-field">
            <span>Format</span>
            <div
              className="app-access-options"
              role="radiogroup"
              aria-label="Writing format"
            >
              <button
                type="button"
                role="radio"
                aria-checked={writingFormat === 'article'}
                className={`app-access-option${
                  writingFormat === 'article' ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setWritingReleaseFormat('article')}
              >
                Article
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={writingFormat === 'book'}
                className={`app-access-option${
                  writingFormat === 'book' ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setWritingReleaseFormat('book')}
              >
                Book
              </button>
            </div>
            <small>
              {writingFormat === 'article'
                ? 'One cover, one Markdown file — every edition shares the same piece.'
                : 'One cover · ordered chapters — holders read one chapter at a time.'}
            </small>
          </div>
        ) : (
          <div className="guild-field">
            <span>Artwork</span>
            <div
              className="app-access-options"
              role="radiogroup"
              aria-label="Artwork mode"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!isVariations}
                className={`app-access-option${
                  !isVariations ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setArtMode('single')}
              >
                One artwork
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isVariations}
                className={`app-access-option${
                  isVariations ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setArtMode('variations')}
              >
                Set of variations
              </button>
            </div>
            <small>
              {isVariations
                ? 'One image per piece — every piece is unique. The set is sealed when the drop starts.'
                : 'Every edition shares the same artwork.'}
            </small>
          </div>
        )}

        {isVariations ? (
          <div className="guild-field">
            <span>Set source</span>
            <div
              className="app-access-options"
              role="radiogroup"
              aria-label="Variation set source"
            >
              <button
                type="button"
                role="radio"
                aria-checked={variationSource === 'upload'}
                className={`app-access-option${
                  variationSource === 'upload' ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setVariationSource('upload')}
              >
                Upload images
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={isGeneratedSet || isPinnedSet}
                className={`app-access-option${
                  isGeneratedSet || isPinnedSet ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setVariationSource('generate')}
              >
                Generate layers
              </button>
            </div>
            <small>
              {isGeneratedSet || isPinnedSet
                ? 'Stack transparent PNG layers, weight rarities — OnSocial mixes and pins the set, up to 10,000 pieces.'
                : `Upload up to ${MAX_SET_PIECES.toLocaleString()} finished images — large sets pin when you start the drop.`}
            </small>
          </div>
        ) : null}

        {isGeneratedSet ? (
          <button
            type="button"
            className="drop-cover-picker drop-studio-launch"
            onClick={() => setStudioOpen(true)}
            disabled={pending}
          >
            <span className="drop-cover-placeholder">
              <strong>
                {design?.working
                  ? 'Generating your set…'
                  : design && design.traits > 0
                    ? 'Continue designing'
                    : 'Design your set'}
              </strong>
              <small>
                {design?.working
                  ? 'Open the studio to watch progress.'
                  : design && design.traits > 0
                    ? `${design.layers} ${design.layers === 1 ? 'layer' : 'layers'} · ${design.traits} trait ${design.traits === 1 ? 'image' : 'images'} so far`
                    : 'Opens the layer studio — stack, weight rarities, generate.'}
              </small>
            </span>
          </button>
        ) : null}

        {isVariations && variationSource === 'upload' ? (
          variationFiles.length === 0 ? (
            <button
              type="button"
              className="drop-cover-picker drop-studio-launch"
              onClick={() => openVariationPicker('replace')}
              disabled={pending}
            >
              <span className="drop-cover-placeholder">
                <strong>Add your set</strong>
                <small>
                  {MIN_VARIATIONS}–{MAX_SET_PIECES.toLocaleString()} images ·
                  same format · ≤5 MB each
                </small>
              </span>
            </button>
          ) : isLargeUpload ? (
            <div className="guild-field">
              <span>
                Your set · {variationFiles.length.toLocaleString()} pieces
              </span>
              <div className="drop-cover-seat-grid" aria-label="Set preview">
                {variationPreviews.map((src, index) => (
                  <DropSeatTile
                    key={src}
                    src={src}
                    label={`Piece ${index + 1}`}
                    disabled={pending}
                    onRemove={() => removeVariationAt(index)}
                  />
                ))}
              </div>
              <div
                className="app-storage-presets"
                role="group"
                aria-label="Set actions"
              >
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending || variationFiles.length >= MAX_SET_PIECES}
                  onClick={() => openVariationPicker('append')}
                >
                  Add more
                </button>
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending}
                  onClick={() => openVariationPicker('replace')}
                >
                  Replace set
                </button>
              </div>
              <small>
                Previewing the first {variationPreviews.length} pieces. The
                whole set pins when you start the drop — order is selection
                order.
              </small>
            </div>
          ) : (
            <div className="guild-field">
              <span>
                Your set · {variationFiles.length} pieces — tap to zoom
              </span>
              <div className="drop-cover-seat-grid" aria-label="Cover piece">
                {variationPreviews.map((src, index) => {
                  const seat = index + 1;
                  return (
                    <DropSeatTile
                      key={src}
                      src={src}
                      label={`Piece ${seat}`}
                      disabled={pending}
                      selected={coverSeat === seat}
                      onRemove={() => removeVariationAt(index)}
                      onSetCover={() => setCoverSeatInput(String(seat))}
                    />
                  );
                })}
              </div>
              <div
                className="app-storage-presets"
                role="group"
                aria-label="Set actions"
              >
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending || variationFiles.length >= MAX_SET_PIECES}
                  onClick={() => openVariationPicker('append')}
                >
                  Add more
                </button>
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending}
                  onClick={() => openVariationPicker('replace')}
                >
                  Replace set
                </button>
              </div>
              <small>
                Piece #{coverSeatValid ? coverSeat : 1} fronts the drop — set
                cover from the zoom view. Every piece keeps its own artwork.
              </small>
            </div>
          )
        ) : null}

        {isPinnedSet && generatedNote ? (
          <>
            {generatedPreviews.length > 0 ? (
              <div
                className="gen-preview-grid"
                aria-label="Generated set previews"
              >
                {generatedPreviews.map((src, index) => (
                  <img
                    key={src}
                    src={src}
                    alt={`Generated piece ${index + 1}`}
                  />
                ))}
              </div>
            ) : null}
            <p className="drop-generated-note">{generatedNote}</p>
          </>
        ) : null}

        {isPinnedSet || isLargeUpload ? (
          <label className="guild-field" htmlFor={fieldId('cover-seat')}>
            <span>Cover piece</span>
            <div className="drop-create-suffix-field">
              <input
                id={fieldId('cover-seat')}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={coverSeatInput}
                onChange={(event) =>
                  setCoverSeatInput(event.target.value.replace(/[^\d]/g, ''))
                }
                placeholder="1"
                aria-label="Cover piece number"
                disabled={pending}
              />
              <span>{supplyValid ? `of ${supply}` : 'piece #'}</span>
            </div>
            <small>
              This piece fronts the drop in the market. Defaults to piece 1.
            </small>
          </label>
        ) : null}

        {isVariations && !isGeneratedSet ? (
          <div className="guild-field">
            <span>Mint order</span>
            <div
              className="app-access-options"
              role="radiogroup"
              aria-label="Mint order"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!randomAssign}
                className={`app-access-option${
                  !randomAssign ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setRandomAssign(false)}
              >
                In order
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={randomAssign}
                className={`app-access-option${
                  randomAssign ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setRandomAssign(true)}
              >
                Random
              </button>
            </div>
            <small>
              {randomAssign
                ? 'Each collector draws a random piece — rare pieces can’t be sniped by timing.'
                : 'Collectors receive the next piece in order (piece 1 first).'}
            </small>
          </div>
        ) : null}

        {!isVariations ? (
          imagePreview ? (
            <div className="guild-field">
              <DropArtworkPreview
                src={imagePreview}
                label={
                  isMusic || isWriting ? 'Cover preview' : 'Artwork preview'
                }
              />
              <div
                className="app-storage-presets"
                role="group"
                aria-label={
                  isMusic || isWriting ? 'Cover actions' : 'Artwork actions'
                }
              >
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending}
                  onClick={() => imageInputRef.current?.click()}
                >
                  Replace
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="drop-cover-picker drop-studio-launch"
              onClick={() => imageInputRef.current?.click()}
              disabled={pending}
            >
              <span className="drop-cover-placeholder">
                <strong>
                  {isMusic || isWriting ? 'Add cover' : 'Add artwork'}
                </strong>
                <small>JPG, PNG, or WebP · ≤5 MB</small>
              </span>
            </button>
          )
        ) : null}
        {!isVariations ? (
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="scarce-cover-file-input"
            tabIndex={-1}
            aria-hidden
            disabled={pending}
            onChange={onImageChange}
          />
        ) : null}
        {isMusic ? (
          <div className="guild-field">
            <span>
              {musicFormat === 'single'
                ? 'Track'
                : `Tracks${trackFiles.length ? ` · ${trackFiles.length}` : ''}`}
            </span>
            {trackFiles.length > 0 ? (
              <DropTrackPreviewList
                files={trackFiles}
                disabled={pending}
                sortable={musicFormat === 'album'}
                onRemove={removeTrackAt}
                onReorder={reorderTracks}
              />
            ) : null}
            <div
              className="app-storage-presets"
              role="group"
              aria-label="Track actions"
            >
              <button
                type="button"
                className="os-surface-chip"
                disabled={
                  pending ||
                  (musicFormat === 'single' && trackFiles.length >= 1) ||
                  (musicFormat === 'album' &&
                    trackFiles.length >= DROP_AUDIO_MAX_TRACKS)
                }
                onClick={() => tracksInputRef.current?.click()}
              >
                {trackFiles.length === 0
                  ? musicFormat === 'single'
                    ? 'Add track'
                    : 'Add tracks'
                  : musicFormat === 'single'
                    ? 'Replace track'
                    : 'Add more'}
              </button>
              {trackFiles.length > 0 ? (
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending}
                  onClick={() => {
                    setTrackFiles([]);
                    setError(null);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <small>
              {musicFormat === 'single'
                ? 'Tap to preview · MP3, M4A, WAV, or similar · ≤20 MB'
                : `Drag to reorder · tap to preview · 2–${DROP_AUDIO_MAX_TRACKS} tracks · ≤20 MB each`}
            </small>
            <input
              ref={tracksInputRef}
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.webm"
              multiple={musicFormat === 'album'}
              className="scarce-cover-file-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending}
              onChange={onTracksChange}
            />
          </div>
        ) : null}
        {isWriting ? (
          <div className="guild-field">
            <span>
              {writingFormat === 'article'
                ? 'Manuscript'
                : `Chapters${
                    chapterFiles.length ? ` · ${chapterFiles.length}` : ''
                  }`}
            </span>
            {chapterFiles.length > 0 ? (
              <DropChapterPreviewList
                files={chapterFiles}
                disabled={pending}
                sortable={writingFormat === 'book'}
                onRemove={removeChapterAt}
                onReorder={reorderChapters}
              />
            ) : null}
            <div
              className="app-storage-presets"
              role="group"
              aria-label={
                writingFormat === 'article'
                  ? 'Manuscript actions'
                  : 'Chapter actions'
              }
            >
              <button
                type="button"
                className="os-surface-chip"
                disabled={
                  pending ||
                  (writingFormat === 'article' && chapterFiles.length >= 1) ||
                  (writingFormat === 'book' &&
                    chapterFiles.length >= DROP_WRITING_MAX_CHAPTERS)
                }
                onClick={() => chaptersInputRef.current?.click()}
              >
                {chapterFiles.length === 0
                  ? writingFormat === 'article'
                    ? 'Add file'
                    : 'Add files'
                  : writingFormat === 'article'
                    ? 'Replace file'
                    : 'Add more'}
              </button>
              {chapterFiles.length > 0 ? (
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending}
                  onClick={() => {
                    setChapterFiles([]);
                    setError(null);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <small>
              {writingFormat === 'article'
                ? '.md or .txt · file name becomes the title · ≤500 KB'
                : `Drag to reorder · file name → title · 2–${DROP_WRITING_MAX_CHAPTERS} · ≤500 KB each`}
            </small>
            <input
              ref={chaptersInputRef}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              multiple={writingFormat === 'book'}
              className="scarce-cover-file-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending}
              onChange={onChaptersChange}
            />
          </div>
        ) : null}
        {isVariations && variationSource === 'upload' ? (
          <input
            ref={variationsInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="scarce-cover-file-input"
            tabIndex={-1}
            aria-hidden
            disabled={pending}
            onChange={onVariationsChange}
          />
        ) : null}

        <label className="guild-field" htmlFor={fieldId('title')}>
          <span>Title</span>
          <input
            id={fieldId('title')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              isWriting
                ? 'The Quiet Hours'
                : isMusic
                  ? 'Night Drive'
                  : 'Genesis Prints'
            }
            maxLength={MAX_TITLE}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Drop ID</span>
          <input
            id={fieldId('id')}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder={
              derivedSlug ||
              (isWriting
                ? 'the-quiet-hours'
                : isMusic
                  ? 'night-drive'
                  : 'genesis-prints')
            }
            maxLength={32}
          />
          <small>
            {collectionId
              ? `Public link: ${collectionPath(collectionId)}`
              : 'From your title — a short unique tag keeps the link yours.'}
          </small>
        </label>

        <label className="guild-field" htmlFor={fieldId('description')}>
          <span>Description</span>
          <textarea
            id={fieldId('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              isWriting
                ? 'Short public blurb — the manuscript uploads separately.'
                : 'What the collection is, why it’s special, and what collectors get.'
            }
            maxLength={MAX_DESCRIPTION}
          />
          <small>
            {description.length}/{MAX_DESCRIPTION}
          </small>
        </label>

        <label className="guild-field" htmlFor={fieldId('series')}>
          <span>Series (optional)</span>
          <input
            id={fieldId('series')}
            value={seriesName}
            onChange={(event) => setSeriesName(event.target.value)}
            placeholder="Ink Studies"
            maxLength={48}
            disabled={pending}
          />
          <small>
            Group this drop with future drops under one ongoing series. Each
            drop stays sealed — the series just keeps them together.
          </small>
        </label>

        {isPinnedSet ? (
          <div className="guild-field">
            <span>Supply</span>
            <div className="drop-create-suffix-field">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={supplyInput}
                onChange={(event) =>
                  setSupplyInput(event.target.value.replace(/[^\d]/g, ''))
                }
                placeholder="1000"
                aria-label="Total pieces in the pinned set"
                disabled={pending}
              />
              <span>pieces</span>
            </div>
            <small>
              Must match the number of files in your pinned folder — the first
              and last files are verified before the drop starts.
            </small>
          </div>
        ) : isGeneratedSet ? (
          <div className="guild-field">
            <span>Supply</span>
            <small>
              Set in the studio — the piece count you generate becomes the
              supply, 1 of each.
            </small>
          </div>
        ) : isVariations ? (
          <div className="guild-field">
            <span>Supply</span>
            <small>
              {variationFiles.length >= MIN_VARIATIONS
                ? `${variationFiles.length} pieces · 1 of each`
                : 'One piece per image — set by your upload.'}
            </small>
          </div>
        ) : (
          <div className="guild-field">
            <span>Supply</span>
            <div className="drop-create-suffix-field">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={supplyInput}
                onChange={(event) =>
                  setSupplyInput(event.target.value.replace(/[^\d]/g, ''))
                }
                placeholder="25"
                aria-label="Total supply"
                disabled={pending}
              />
              <span>{template.unit}</span>
            </div>
            <div
              className="app-storage-presets"
              role="group"
              aria-label="Total supply"
            >
              {SUPPLY_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`os-surface-chip${
                    supply === preset ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setSupplyInput(String(preset))}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="guild-field">
          <span>Price per {template.unitSingular}</span>
          <div className="drop-create-suffix-field">
            <input
              id={fieldId('price')}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={priceInput}
              onChange={(event) =>
                setPriceInput(
                  normalizeAmountInput(event.target.value, NEAR_INPUT_DECIMALS)
                )
              }
              onBlur={() =>
                setPriceInput(
                  finalizeAmountInput(priceInput, NEAR_INPUT_DECIMALS)
                )
              }
              placeholder="1"
              aria-label={`Price per ${template.unitSingular} in NEAR`}
              disabled={pending}
            />
            <span>NEAR</span>
          </div>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Quick prices"
          >
            {PRICE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`os-surface-chip${
                  price === preset ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setPriceInput(preset)}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <ScarceRoyaltyField
          royaltyBps={royaltyBps}
          isCustomRoyalty={isCustomRoyalty}
          customRoyaltyInput={customRoyaltyInput}
          pending={pending}
          primaryAccountId={accountId ?? ''}
          shares={resolvedRoyaltyShares}
          onSharesChange={setRoyaltyShares}
          onRoyaltyBpsChange={setRoyaltyBps}
          onCustomRoyaltyChange={setCustomRoyaltyInput}
          onCustomToggle={setIsCustomRoyalty}
        />

        <div className="guild-field">
          <button
            type="button"
            className="collection-allowlist-toggle"
            disabled={pending}
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            {showAdvanced ? 'Hide advanced' : 'Advanced'}
          </button>
        </div>

        {showAdvanced ? (
          <>
            <div className="guild-field">
              <span>Sale window</span>
              <div className="drop-schedule-pair">
                <div
                  className={`drop-schedule-cell${
                    startTime ? ' has-value' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="drop-schedule-cell-main"
                    disabled={pending}
                    onClick={() => setScheduleField('opens')}
                  >
                    <span className="drop-schedule-cell-label">Opens</span>
                    <span className="drop-schedule-cell-value">
                      {startTime ? formatScheduleLabel(startTime) : 'Now'}
                    </span>
                  </button>
                  {startTime ? (
                    <button
                      type="button"
                      className="drop-schedule-cell-clear"
                      disabled={pending}
                      aria-label="Clear open time"
                      onClick={() => setStartTime('')}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
                <div
                  className={`drop-schedule-cell${endTime ? ' has-value' : ''}`}
                >
                  <button
                    type="button"
                    className="drop-schedule-cell-main"
                    disabled={pending}
                    onClick={() => setScheduleField('closes')}
                  >
                    <span className="drop-schedule-cell-label">Closes</span>
                    <span className="drop-schedule-cell-value">
                      {endTime ? formatScheduleLabel(endTime) : 'No end'}
                    </span>
                  </button>
                  {endTime ? (
                    <button
                      type="button"
                      className="drop-schedule-cell-clear"
                      disabled={pending}
                      aria-label="Clear close time"
                      onClick={() => setEndTime('')}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
              <small>
                Live until sold out — tap a side to set, ✕ to clear.
              </small>
            </div>

            <label className="guild-field" htmlFor={fieldId('per-wallet')}>
              <span>Max per wallet</span>
              <div className="drop-create-suffix-field">
                <input
                  id={fieldId('per-wallet')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={maxPerWallet}
                  onChange={(event) =>
                    setMaxPerWallet(event.target.value.replace(/[^\d]/g, ''))
                  }
                  placeholder="No limit"
                  aria-label={`Max ${template.unit} per wallet`}
                  disabled={pending}
                />
                <span>{template.unit}</span>
              </div>
            </label>

            <div className="guild-field">
              <span>Transferable</span>
              <div
                className="app-access-options"
                role="radiogroup"
                aria-label="Transferable"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={transferable}
                  className={`app-access-option${
                    transferable ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setTransferable(true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!transferable}
                  className={`app-access-option${
                    !transferable ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setTransferable(false)}
                >
                  Soulbound
                </button>
              </div>
              <small>
                {transferable
                  ? 'Collectors can transfer and resell their edition.'
                  : 'Stays with the buyer — they can’t resell it.'}
              </small>
            </div>

            <div className="guild-field">
              <span>Renewable</span>
              <div
                className="app-access-options"
                role="radiogroup"
                aria-label="Renewable"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={renewable}
                  className={`app-access-option${
                    renewable ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setRenewable(true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!renewable}
                  className={`app-access-option${
                    !renewable ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => {
                    setRenewable(false);
                    setAccessEnds('');
                  }}
                >
                  No
                </button>
              </div>
              <small>
                {renewable
                  ? 'You can extend each edition’s access end date later.'
                  : 'Access end dates can’t be extended later.'}
              </small>
            </div>

            {renewable ? (
              <div className="guild-field">
                <span>Access ends (optional)</span>
                <div
                  className={`drop-schedule-cell${
                    accessEnds ? ' has-value' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="drop-schedule-cell-main"
                    disabled={pending}
                    onClick={() => setScheduleField('access')}
                  >
                    <span className="drop-schedule-cell-label">
                      Access ends
                    </span>
                    <span className="drop-schedule-cell-value">
                      {accessEnds ? formatScheduleLabel(accessEnds) : 'No end'}
                    </span>
                  </button>
                  {accessEnds ? (
                    <button
                      type="button"
                      className="drop-schedule-cell-clear"
                      disabled={pending}
                      aria-label="Clear access end"
                      onClick={() => setAccessEnds('')}
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
                <small>
                  Same end date on every edition. Leave blank for no expiry.
                </small>
              </div>
            ) : null}

            <label className="guild-field" htmlFor={fieldId('max-redeems')}>
              <span>Max redeems (optional)</span>
              <div className="drop-create-suffix-field">
                <input
                  id={fieldId('max-redeems')}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={maxRedeemsInput}
                  onChange={(event) =>
                    setMaxRedeemsInput(event.target.value.replace(/[^\d]/g, ''))
                  }
                  placeholder="No limit"
                  aria-label="Max redeems per edition"
                  disabled={pending}
                />
                <span>redeems</span>
              </div>
              <small>
                How many times each edition can be redeemed. Blank = no cap.
              </small>
            </label>

            <div className="guild-field">
              <span>Allowlist</span>
              <div className="app-storage-presets scarce-choice-chip-row">
                <button
                  type="button"
                  className={`os-surface-chip scarce-choice-chip${
                    allowlistSheetOpen || draftAllowlist.length > 0
                      ? ' is-selected'
                      : ''
                  }`}
                  disabled={pending || !accountId}
                  aria-haspopup="dialog"
                  aria-expanded={allowlistSheetOpen}
                  aria-label={
                    draftAllowlist.length > 0
                      ? `Allowlist: ${draftAllowlist.length} accounts`
                      : 'Allowlist: add accounts'
                  }
                  onClick={() => {
                    if (!accountId) return;
                    setAllowlistSheetOpen(true);
                  }}
                >
                  <span className="scarce-choice-chip-value">
                    {draftAllowlist.length === 0
                      ? 'None'
                      : draftAllowlist.length === 1
                        ? '1 account'
                        : `${draftAllowlist.length} accounts`}
                  </span>
                </button>
              </div>
              <small>
                {draftAllowlist.length === 0
                  ? startTime.trim()
                    ? 'Optional. Listed accounts mint before Opens; then anyone can.'
                    : 'Optional. Needs Opens in Sale window — otherwise the list never gates minting.'
                  : startTime.trim()
                    ? 'Listed accounts mint before Opens. After that, anyone can.'
                    : 'Set Opens in Sale window so this list can mint early — or clear it.'}
              </small>
            </div>
          </>
        ) : null}

        {error ? (
          <p ref={errorRef} className="guild-form-error">
            {error}
          </p>
        ) : null}
      </form>

      <InfoDrawer
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={`${template.label} drops`}
        summary={template.tagline}
        detail={template.hint}
      />

      <GenerativeStudioHelpDrawer
        open={studioHelpOpen}
        onClose={() => setStudioHelpOpen(false)}
      />

      <DropSaleWindowSheet
        open={scheduleField != null}
        field={scheduleField}
        value={
          scheduleField === 'closes'
            ? endTime
            : scheduleField === 'access'
              ? accessEnds
              : startTime
        }
        minValue={
          scheduleField === 'closes' && startTime ? startTime : undefined
        }
        maxValue={scheduleField === 'opens' && endTime ? endTime : undefined}
        onClose={() => setScheduleField(null)}
        onChange={(next) => {
          if (scheduleField === 'closes') setEndTime(next);
          else if (scheduleField === 'access') setAccessEnds(next);
          else setStartTime(next);
        }}
      />

      {accountId ? (
        <CollectionAllowlistSheet
          open={allowlistSheetOpen}
          creatorId={accountId}
          maxPerWallet={
            (() => {
              const perWallet = Number.parseInt(maxPerWallet, 10);
              return Number.isSafeInteger(perWallet) && perWallet > 0
                ? perWallet
                : null;
            })()
          }
          initialEntries={draftAllowlist}
          onApply={setDraftAllowlist}
          onClose={() => setAllowlistSheetOpen(false)}
        />
      ) : null}
    </OsAppScreen>
  );
}
