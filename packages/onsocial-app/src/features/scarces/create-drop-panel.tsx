'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AmountFieldMetaRow,
  ArrowLeftIcon,
  DiscardConfirmSheet,
  OsSheetAction,
  OsSheetActions,
  OsIconAction,
  OsAppChromeToolbarRail,
  QuestionMarkCircleFillIcon,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { InfoDrawer } from '@onsocial/ui';
import { AmountField } from '@onsocial/ui';
import { SuffixField } from '@onsocial/ui';
import {
  DropFieldInfoDrawer,
  DropFieldLabel,
  type DropFieldInfoKey,
} from '@/features/scarces/drop-field-info';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useDockAutoHide } from '@/hooks/use-dock-auto-hide';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { createAppOnSocialClient } from '@/lib/create-app-onsocial-client';
import {
  CollectionAllowlistSheet,
  type AllowlistEntry,
} from '@/features/scarces/collection-allowlist-manager';
import { DropArtworkPreview } from '@/features/scarces/drop-artwork-preview';
import { DropVariationSetManager } from '@/features/scarces/drop-variation-set-manager';
import { reorderByInsert } from '@/features/scarces/drop-track-order';
import {
  DropCoverCollagePicker,
  emptyCollageSelection,
  type DropCoverCollageSelection,
} from '@/features/scarces/drop-cover-collage-picker';
import {
  buildCollectionId,
  randomDropIdSuffix,
} from '@/features/scarces/drop-collection-id';
import { resolveScarceMediaUrl } from '@/features/market/market-listings';
import {
  collageFetchUrl,
  sampleCollageSeats,
  type CollageSeatImage,
} from '@/lib/variation-cover-collage';
import {
  DROP_AUDIO_MAX_BYTES,
  DROP_AUDIO_MAX_TRACKS,
  isDropAudioMime,
  musicTracksValid,
  normalizeTrackLyrics,
  sha256BlobBase64,
  trackTitleFromFile,
  type MusicReleaseFormat,
} from '@/features/scarces/drop-audio';
import { DropTrackPreviewList } from '@/features/scarces/drop-track-preview-list';
import {
  DROP_WRITING_MAX_CHAPTERS,
  DROP_WRITING_PDF_MAX_BYTES,
  bookPdfRefFromPinnedFile,
  buildWritingManifest,
  chaptersFromPinnedFiles,
  dropWritingMaxBytes,
  isDropWritingChapterMime,
  isWritingPdfMime,
  writingChaptersValid,
  type WritingReleaseFormat,
} from '@/features/scarces/drop-writing';
import { DropChapterPreviewList } from '@/features/scarces/drop-chapter-preview-list';
import { DropFacetsEditor } from '@/features/scarces/drop-facets-editor';
import {
  dropFacetFieldLabel,
  dropFacetsExtraFields,
  dropFacetsLabel,
  ensureGenerativeFacet,
  normalizeDropFacetMedium,
  normalizeDropFacets,
} from '@/features/scarces/drop-facets';
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
import {
  formatGenerativeRarityLines,
  type GenerativeRarity,
} from '@/features/scarces/generative-set';
import { GenerativeStudioHelpDrawer } from '@/features/scarces/generative-studio-help-drawer';
import {
  clearDropPinDraft,
  clearDropPinDraftIfKind,
  largeSetPinFingerprint,
  loadDropPinDraft,
  musicPinFingerprint,
  saveDropPinDraft,
  writingPinFingerprint,
} from '@/features/scarces/drop-pin-draft';
import {
  clearDropFormDraft,
  loadDropFormDraft,
  saveDropFormDraft,
} from '@/features/scarces/drop-form-draft';
import {
  DropStartConfirmSheet,
  type DropStartConfirmPhase,
  type DropStartSummaryRow,
} from '@/features/scarces/drop-start-confirm-sheet';
import {
  DropSaleWindowSheet,
  formatScheduleLabel,
  localDateTimeToMs,
  localDateTimeToNs,
  type SaleWindowField,
} from '@/features/scarces/drop-sale-window-sheet';
import { ticketEventExtraFields } from '@/features/scarces/ticket-event-meta';
import { normalizePlaceSlug, placeLabel } from '@/lib/post-place';
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
import { finalizeAmountInput } from '@/lib/amount-input';
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

function isFormFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
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
  const seriesQuery = searchParams.get('series')?.trim() ?? '';
  const { accountId, isConnected, isLoading, connect, getSigningWallet } =
    useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [templateId, setTemplateId] = useState<DropTemplateId>('art');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  /** Fixed for this form session — keeps the public-link preview honest. */
  const [idSuffix, setIdSuffix] = useState(() => randomDropIdSuffix());
  const [description, setDescription] = useState('');
  const [supplyInput, setSupplyInput] = useState('25');
  const [priceInput, setPriceInput] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventStarts, setEventStarts] = useState('');
  const [eventEnds, setEventEnds] = useState('');
  const [placeDraft, setPlaceDraft] = useState('');
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
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const [artMode, setArtMode] = useState<DropArtMode>('single');
  const [musicFormat, setMusicFormat] = useState<MusicReleaseFormat>('single');
  const [trackFiles, setTrackFiles] = useState<File[]>([]);
  /** Parallel to `trackFiles` — optional lyrics draft per track. */
  const [trackLyrics, setTrackLyrics] = useState<string[]>([]);
  const [writingFormat, setWritingFormat] =
    useState<WritingReleaseFormat>('article');
  const [facets, setFacets] = useState<string[]>([]);
  const [chapterFiles, setChapterFiles] = useState<File[]>([]);
  const [bookPdfFile, setBookPdfFile] = useState<File | null>(null);
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
  const [collage, setCollage] = useState<DropCoverCollageSelection>(() =>
    emptyCollageSelection()
  );
  const [traitsCid, setTraitsCid] = useState('');
  const [randomAssign, setRandomAssign] = useState(false);
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  const [generatedPreviews, setGeneratedPreviews] = useState<string[]>([]);
  const [generatedRarity, setGeneratedRarity] =
    useState<GenerativeRarity | null>(null);
  /** Server generate job — persisted so a refresh can resume polling. */
  const [generateJobId, setGenerateJobId] = useState<string | null>(null);
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
    playable: Array<{
      cid: string;
      mime: string;
      title?: string;
      lyrics?: string;
    }>;
    coverCid: string;
    coverHash: string;
  } | null>(null);
  const [pinnedWriting, setPinnedWriting] = useState<{
    writingManifestCid: string;
    writingFormat: WritingReleaseFormat;
    chapterCount: number;
    coverCid: string;
    coverHash: string;
    hasBookPdf?: boolean;
  } | null>(null);
  const [pinnedLargeSet, setPinnedLargeSet] = useState<{
    cid: string;
    ext: string;
    pieceCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [fieldInfoKey, setFieldInfoKey] = useState<DropFieldInfoKey | null>(
    null
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPhase, setConfirmPhase] =
    useState<DropStartConfirmPhase>('review');
  const [uploadLabel, setUploadLabel] = useState('Uploading…');
  const pinHydratedRef = useRef(false);
  const formHydratedRef = useRef(false);
  const skipFormSaveRef = useRef(true);
  const seriesQueryAppliedRef = useRef(false);
  const prevAccountIdRef = useRef<string | null | undefined>(undefined);
  const startInFlightRef = useRef(false);
  const skipMusicPinInvalidate = useRef(true);
  const skipWritingPinInvalidate = useRef(true);
  const skipLargePinInvalidate = useRef(true);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const tracksInputRef = useRef<HTMLInputElement>(null);
  const chaptersInputRef = useRef<HTMLInputElement>(null);
  const bookPdfInputRef = useRef<HTMLInputElement>(null);
  const variationsInputRef = useRef<HTMLInputElement>(null);
  /** Replace wipes the set; append adds to the end (same format). */
  const variationPickModeRef = useRef<'replace' | 'append'>('replace');
  const variationFilesRef = useRef(variationFiles);
  variationFilesRef.current = variationFiles;
  const errorRef = useRef<HTMLParagraphElement>(null);
  const scrollRootRef = useRef<HTMLElement | null>(null);
  const toolbarHidden = useDockAutoHide(false, scrollRootRef);
  const [formFieldFocused, setFormFieldFocused] = useState(false);
  const formKeyboardActive = formFieldFocused && !studioOpen;
  const formViewport = useVisualViewportSheetMetrics(formKeyboardActive);
  const formKeyboardOpen =
    formKeyboardActive && formViewport.isMobile && formViewport.lift > 0;

  const handleFormFocusCapture = useCallback(
    (event: FocusEvent<HTMLFormElement>) => {
      if (isFormFieldTarget(event.target)) setFormFieldFocused(true);
    },
    []
  );

  const handleFormBlurCapture = useCallback(
    (event: FocusEvent<HTMLFormElement>) => {
      const next = event.relatedTarget;
      const form = event.currentTarget;
      if (
        next instanceof Node &&
        form.contains(next) &&
        isFormFieldTarget(next)
      ) {
        return;
      }
      setFormFieldFocused(false);
    },
    []
  );

  const screenStyle = useMemo(
    () =>
      ({
        ['--drop-create-keyboard-lift' as string]: formKeyboardOpen
          ? `${formViewport.lift}px`
          : '0px',
      }) as CSSProperties,
    [formKeyboardOpen, formViewport.lift]
  );

  const clearPins = useCallback(() => {
    setPinnedMusic(null);
    setPinnedWriting(null);
    setPinnedLargeSet(null);
    setGenerateJobId(null);
    clearDropPinDraft();
  }, []);

  const resetCreateForm = useCallback(() => {
    clearPins();
    clearDropFormDraft();
    setTemplateId('art');
    setTitle('');
    setSlug('');
    setIdSuffix(randomDropIdSuffix());
    setDescription('');
    setSupplyInput('25');
    setPriceInput('1');
    setStartTime('');
    setEndTime('');
    setEventStarts('');
    setEventEnds('');
    setPlaceDraft('');
    setAccessEnds('');
    setMaxPerWallet('');
    setRoyaltyBps(DEFAULT_ROYALTY_BPS);
    setIsCustomRoyalty(false);
    setCustomRoyaltyInput('');
    setRoyaltyShares([]);
    setTransferable(true);
    setRenewable(false);
    setMaxRedeemsInput('');
    setDraftAllowlist([]);
    setShowAdvanced(false);
    setArtMode('single');
    setMusicFormat('single');
    setTrackFiles([]);
    setTrackLyrics([]);
    setWritingFormat('article');
    setFacets([]);
    setChapterFiles([]);
    setBookPdfFile(null);
    setImageFile(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVariationFiles([]);
    setVariationPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setVariationSource('upload');
    setVariationsCid('');
    setVariationsExt('png');
    setCoverSeatInput('1');
    setCollage(emptyCollageSelection());
    setTraitsCid('');
    setRandomAssign(false);
    setGeneratedNote(null);
    setGeneratedPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    setGeneratedRarity(null);
    setGenerateJobId(null);
    setStudioOpen(false);
    setSeriesName('');
    setError(null);
    setDiscardDraftOpen(false);
  }, [clearPins]);

  // Invalidate pins if the creator changes files after prepare — keep when
  // the local fingerprint still matches the saved draft for this account.
  useEffect(() => {
    if (skipMusicPinInvalidate.current) {
      skipMusicPinInvalidate.current = false;
      return;
    }
    if (trackFiles.length === 0 || !imageFile) return;
    if (accountId) {
      const fingerprint = musicPinFingerprint({
        format: musicFormat,
        tracks: trackFiles,
        lyrics: trackLyrics,
        cover: imageFile,
      });
      const draft = loadDropPinDraft(accountId);
      if (draft?.kind === 'music' && draft.fingerprint === fingerprint) {
        setPinnedMusic(draft.pinned);
        return;
      }
    }
    setPinnedMusic(null);
    clearDropPinDraftIfKind(accountId, 'music');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackFiles, trackLyrics, imageFile, musicFormat]);

  useEffect(() => {
    if (skipWritingPinInvalidate.current) {
      skipWritingPinInvalidate.current = false;
      return;
    }
    if (chapterFiles.length === 0 || !imageFile) return;
    if (accountId) {
      const fingerprint = writingPinFingerprint({
        format: writingFormat,
        chapters: chapterFiles,
        cover: imageFile,
        bookPdf: bookPdfFile,
      });
      const draft = loadDropPinDraft(accountId);
      if (draft?.kind === 'writing' && draft.fingerprint === fingerprint) {
        setPinnedWriting(draft.pinned);
        return;
      }
    }
    setPinnedWriting(null);
    clearDropPinDraftIfKind(accountId, 'writing');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterFiles, bookPdfFile, imageFile, writingFormat]);

  useEffect(() => {
    if (skipLargePinInvalidate.current) {
      skipLargePinInvalidate.current = false;
      return;
    }
    if (variationFiles.length === 0) return;
    if (accountId) {
      const fingerprint = largeSetPinFingerprint(variationFiles);
      const draft = loadDropPinDraft(accountId);
      if (draft?.kind === 'large-set' && draft.fingerprint === fingerprint) {
        setPinnedLargeSet(draft.pinned);
        return;
      }
    }
    setPinnedLargeSet(null);
    clearDropPinDraftIfKind(accountId, 'large-set');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variationFiles]);

  // Resume form fields + successful pins after refresh (same account, unexpired).
  useEffect(() => {
    const prev = prevAccountIdRef.current;
    prevAccountIdRef.current = accountId;

    if (!accountId) {
      clearPins();
      pinHydratedRef.current = false;
      formHydratedRef.current = false;
      skipFormSaveRef.current = true;
      return;
    }

    if (prev && prev !== accountId) {
      clearPins();
      pinHydratedRef.current = false;
      formHydratedRef.current = false;
      skipFormSaveRef.current = true;
    }

    if (formHydratedRef.current && pinHydratedRef.current) return;

    skipFormSaveRef.current = true;
    const formDraft = loadDropFormDraft(accountId);
    if (!formHydratedRef.current) {
      formHydratedRef.current = true;
      if (formDraft) {
        setTemplateId(formDraft.templateId);
        setTitle(formDraft.title);
        setSlug(formDraft.slug);
        setIdSuffix(formDraft.idSuffix);
        setDescription(formDraft.description);
        setSeriesName(formDraft.seriesName);
        setSupplyInput(formDraft.supplyInput);
        setPriceInput(formDraft.priceInput);
        setStartTime(formDraft.startTime);
        setEndTime(formDraft.endTime);
        setEventStarts(formDraft.eventStarts);
        setEventEnds(formDraft.eventEnds);
        setPlaceDraft(formDraft.placeDraft);
        setAccessEnds(formDraft.accessEnds);
        setMaxPerWallet(formDraft.maxPerWallet);
        setRoyaltyBps(formDraft.royaltyBps);
        setIsCustomRoyalty(formDraft.isCustomRoyalty);
        setCustomRoyaltyInput(formDraft.customRoyaltyInput);
        setRoyaltyShares(formDraft.royaltyShares);
        setTransferable(formDraft.transferable);
        setRenewable(formDraft.renewable);
        setMaxRedeemsInput(formDraft.maxRedeemsInput);
        setDraftAllowlist(formDraft.draftAllowlist);
        setArtMode(formDraft.artMode);
        setMusicFormat(formDraft.musicFormat);
        setWritingFormat(formDraft.writingFormat);
        setFacets(formDraft.facets);
        setVariationsExt(formDraft.variationsExt);
        setCoverSeatInput(formDraft.coverSeatInput);
        setRandomAssign(formDraft.randomAssign);
        setShowAdvanced(formDraft.showAdvanced);
        const storedCid = formDraft.variationsCid.trim();
        // `cid` was a leaked source flip after generate — restore as generate.
        const source =
          formDraft.variationSource === 'cid'
            ? 'generate'
            : formDraft.variationSource;
        if (source === 'generate' && !looksLikeCid(storedCid)) {
          setVariationSource('generate');
          setVariationsCid('');
          setTraitsCid('');
        } else {
          setVariationSource(source);
          setVariationsCid(formDraft.variationsCid);
          setTraitsCid(formDraft.traitsCid);
          if (looksLikeCid(storedCid)) {
            const count = formDraft.supplyInput.trim();
            setGeneratedNote(
              count
                ? `Set pinned — ${count} pieces ready to mint.`
                : 'Set pinned — ready to mint.'
            );
            if (formDraft.generativeRarity) {
              setGeneratedRarity(formDraft.generativeRarity);
            }
          }
        }
      }
    }

    if (!pinHydratedRef.current) {
      pinHydratedRef.current = true;
      const draft = loadDropPinDraft(accountId);
      if (draft) {
        const formTemplate = formDraft?.templateId;
        if (draft.kind === 'music') {
          if (!formTemplate || formTemplate === 'audio') {
            setTemplateId('audio');
            setMusicFormat(draft.musicFormat);
            setPinnedMusic(draft.pinned);
          }
        } else if (draft.kind === 'writing') {
          if (!formTemplate || formTemplate === 'writing') {
            setTemplateId('writing');
            setWritingFormat(draft.pinned.writingFormat || draft.writingFormat);
            setPinnedWriting(draft.pinned);
          }
        } else if (draft.kind === 'generate-job') {
          if (
            !formTemplate ||
            formTemplate === 'art' ||
            formTemplate === 'custom'
          ) {
            setTemplateId(draft.templateId === 'custom' ? 'custom' : 'art');
            setArtMode('variations');
            setVariationSource('generate');
            setGenerateJobId(draft.jobId);
            setStudioOpen(true);
          }
        } else if (draft.kind === 'large-set') {
          if (
            !formTemplate ||
            formTemplate === 'art' ||
            formTemplate === 'custom'
          ) {
            setTemplateId(draft.templateId === 'custom' ? 'custom' : 'art');
            setArtMode('variations');
            setVariationSource('upload');
            setPinnedLargeSet(draft.pinned);
            setSupplyInput(String(draft.pinned.pieceCount));
          }
        }
      }
    }

    // Allow saves after hydrate settles.
    const t = window.setTimeout(() => {
      skipFormSaveRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [accountId, clearPins]);

  // Optional `?series=` prefill when nothing else set the series field.
  useEffect(() => {
    if (seriesQueryAppliedRef.current) return;
    if (!seriesQuery) return;
    seriesQueryAppliedRef.current = true;
    setSeriesName((prev) => (prev.trim() ? prev : seriesQuery.slice(0, 48)));
  }, [seriesQuery]);

  const template =
    DROP_TEMPLATES.find((entry) => entry.id === templateId) ??
    DROP_TEMPLATES[0];

  // Persist non-file form state so refresh restores title / pricing / Advanced.
  useEffect(() => {
    if (!accountId || skipFormSaveRef.current) return;
    const handle = window.setTimeout(() => {
      saveDropFormDraft({
        accountId,
        templateId,
        title,
        slug,
        idSuffix,
        description,
        seriesName,
        supplyInput,
        priceInput,
        startTime,
        endTime,
        eventStarts,
        eventEnds,
        placeDraft,
        accessEnds,
        maxPerWallet,
        royaltyBps,
        isCustomRoyalty,
        customRoyaltyInput,
        royaltyShares,
        transferable,
        renewable,
        maxRedeemsInput,
        draftAllowlist,
        artMode,
        musicFormat,
        writingFormat,
        facets,
        variationSource,
        variationsCid,
        variationsExt,
        coverSeatInput,
        traitsCid,
        randomAssign,
        showAdvanced,
        ...(generatedRarity ? { generativeRarity: generatedRarity } : {}),
      });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [
    accountId,
    templateId,
    title,
    slug,
    idSuffix,
    description,
    seriesName,
    supplyInput,
    priceInput,
    startTime,
    endTime,
    eventStarts,
    eventEnds,
    placeDraft,
    accessEnds,
    maxPerWallet,
    royaltyBps,
    isCustomRoyalty,
    customRoyaltyInput,
    royaltyShares,
    transferable,
    renewable,
    maxRedeemsInput,
    draftAllowlist,
    artMode,
    musicFormat,
    writingFormat,
    facets,
    variationSource,
    variationsCid,
    variationsExt,
    coverSeatInput,
    traitsCid,
    randomAssign,
    showAdvanced,
    generatedRarity,
  ]);

  // The submit action lives in the header, so bring failures into view.
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  const applyTemplate = useCallback(
    (next: DropTemplate) => {
      clearPins();
      setTemplateId(next.id);
      setFacets([]);
      if (next.presets) {
        setTransferable(next.presets.transferable);
        setRenewable(next.presets.renewable);
        setMaxRedeemsInput(next.presets.maxRedeems);
        if (!next.presets.renewable) setAccessEnds('');
      }
      if (next.id === 'ticket') {
        // Event ends stamps expires_at — no separate Access ends field.
        setAccessEnds('');
      } else {
        setEventStarts('');
        setEventEnds('');
        setPlaceDraft('');
      }
      // Art / Writing / Audio close Advanced; ticket-like kinds keep essentials open.
      setShowAdvanced(Boolean(next.openAdvanced));
      setStudioOpen(false);
      if (next.id === 'audio') {
        setArtMode('single');
        setMusicFormat('single');
      }
      if (next.id === 'writing') {
        setArtMode('single');
        setWritingFormat('article');
        setBookPdfFile(null);
      } else {
        setBookPdfFile(null);
      }
      setError(null);
    },
    [clearPins]
  );

  const isAudio = templateId === 'audio';
  const isWriting = templateId === 'writing';
  const isTicket = templateId === 'ticket';
  const createFacetMedium = isAudio
    ? ('audio' as const)
    : isWriting
      ? ('writing' as const)
      : normalizeDropFacetMedium(template.kind ?? templateId);
  const isVariations = !isAudio && !isWriting && artMode === 'variations';
  const isPinnedSet = isVariations && variationSource === 'cid';
  const isGeneratedSet = isVariations && variationSource === 'generate';
  const pinnedCidValid = looksLikeCid(variationsCid.trim());
  const traitsCidValid = !traitsCid.trim() || looksLikeCid(traitsCid.trim());
  /** Generated (or any traits-backed) directory set ready to start. */
  const generatedSetReady =
    isGeneratedSet && pinnedCidValid && looksLikeCid(traitsCid.trim());
  const usePinnedCids = isPinnedSet || generatedSetReady;
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
    isVariations && !usePinnedCids
      ? variationFiles.length > 0
        ? variationFiles.length
        : (pinnedLargeSet?.pieceCount ?? 0)
      : editionSupply;
  const price = finalizeAmountInput(priceInput, NEAR_INPUT_DECIMALS);
  const supplyValid =
    isVariations && !usePinnedCids
      ? pinnedLargeSet != null
        ? supply >= MIN_VARIATIONS && supply <= MAX_SET_PIECES
        : variationFiles.length >= MIN_VARIATIONS &&
          variationFiles.length <= MAX_SET_PIECES
      : Number.isSafeInteger(editionSupply) &&
        editionSupply >= (usePinnedCids ? MIN_VARIATIONS : MIN_SUPPLY) &&
        editionSupply <= MAX_SUPPLY;
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

  const [collageImages, setCollageImages] = useState<CollageSeatImage[]>([]);

  useEffect(() => {
    if (!isVariations) {
      setCollageImages([]);
      return;
    }

    const ephemeral: string[] = [];
    const takeFileUrl = (seat: number, file: File): string => {
      if (seat <= variationPreviews.length && variationPreviews[seat - 1]) {
        return variationPreviews[seat - 1]!;
      }
      const url = URL.createObjectURL(file);
      ephemeral.push(url);
      return url;
    };

    if (variationFiles.length > 0) {
      const seats = sampleCollageSeats(
        Array.from({ length: variationFiles.length }, (_, i) => i + 1),
        coverSeatValid ? coverSeat : 1,
        16
      );
      setCollageImages(
        seats.flatMap((seat) => {
          const file = variationFiles[seat - 1];
          return file ? [{ seat, src: takeFileUrl(seat, file) }] : [];
        })
      );
    } else if (generatedPreviews.length > 0) {
      const seats = sampleCollageSeats(
        Array.from({ length: generatedPreviews.length }, (_, i) => i + 1),
        coverSeatValid ? coverSeat : 1,
        16
      );
      setCollageImages(
        seats.flatMap((seat) => {
          const src = generatedPreviews[seat - 1];
          return src ? [{ seat, src }] : [];
        })
      );
    } else if (pinnedCidValid && supplyValid) {
      const cid = variationsCid.trim();
      const ext = variationsExt;
      const seats = sampleCollageSeats(
        Array.from({ length: Math.min(supply, 64) }, (_, i) => i + 1),
        coverSeatValid ? coverSeat : 1,
        16
      );
      setCollageImages(
        seats.map((seat) => ({
          seat,
          src: collageFetchUrl(`ipfs://${cid}/${seat}.${ext}`),
        }))
      );
    } else {
      setCollageImages([]);
    }

    return () => {
      for (const url of ephemeral) URL.revokeObjectURL(url);
    };
  }, [
    isVariations,
    variationFiles,
    variationPreviews,
    generatedPreviews,
    pinnedCidValid,
    supplyValid,
    variationsCid,
    variationsExt,
    supply,
    coverSeat,
    coverSeatValid,
  ]);

  const collageReady =
    !isVariations || collageImages.length === 0 || collage.blob != null;

  const tracksReady =
    !isAudio ||
    musicTracksValid(musicFormat, trackFiles.length) ||
    pinnedMusic != null;
  const chaptersReady =
    !isWriting ||
    writingChaptersValid(writingFormat, chapterFiles.length) ||
    pinnedWriting != null;
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
    collageReady &&
    tracksReady &&
    chaptersReady &&
    resolvedRoyaltyBps != null &&
    (!template.requiresEventEnd || eventEnds.trim().length > 0) &&
    (!template.requiresAccessEnd || accessEnds.trim().length > 0) &&
    (isVariations
      ? usePinnedCids
        ? pinnedCidValid
        : variationFiles.length >= MIN_VARIATIONS || pinnedLargeSet != null
      : imageFile != null || pinnedMusic != null || pinnedWriting != null);

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
      setTrackLyrics((prev) => {
        if (musicFormat === 'single') {
          return [''];
        }
        const added = picked.map(() => '');
        return [...prev, ...added].slice(0, DROP_AUDIO_MAX_TRACKS);
      });
    },
    [musicFormat]
  );

  const removeTrackAt = useCallback((index: number) => {
    setTrackFiles((prev) => prev.filter((_, i) => i !== index));
    setTrackLyrics((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reorderTracks = useCallback((next: File[], nextLyrics: string[]) => {
    setTrackFiles(next);
    setTrackLyrics(nextLyrics);
  }, []);

  const setTrackLyricsAt = useCallback((index: number, value: string) => {
    setTrackLyrics((prev) => {
      const next = prev.slice();
      while (next.length <= index) next.push('');
      next[index] = value;
      return next;
    });
  }, []);

  const setMusicReleaseFormat = useCallback((format: MusicReleaseFormat) => {
    setMusicFormat(format);
    if (format === 'single') {
      setTrackFiles((prev) => prev.slice(0, 1));
      setTrackLyrics((prev) => prev.slice(0, 1));
    }
    setError(null);
  }, []);

  const onChaptersChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (picked.length === 0) return;
      for (const file of picked) {
        if (!isDropWritingChapterMime(file.type, file.name, writingFormat)) {
          if (
            writingFormat === 'book' &&
            isWritingPdfMime(file.type, file.name)
          ) {
            setError(
              'Books use Markdown chapters — add a whole-book PDF below.'
            );
          } else {
            setError(
              writingFormat === 'book'
                ? 'Use Markdown (.md) or plain text (.txt) for chapters.'
                : 'Use Markdown (.md), plain text (.txt), or PDF (.pdf).'
            );
          }
          return;
        }
        if (file.size > dropWritingMaxBytes(file)) {
          setError(
            isWritingPdfMime(file.type, file.name)
              ? `Each PDF must be ${Math.round(DROP_WRITING_PDF_MAX_BYTES / (1024 * 1024))} MB or smaller.`
              : 'Each Markdown / text chapter must be 500 KB or smaller.'
          );
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

  const onBookPdfChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = '';
      if (!file) return;
      if (!isWritingPdfMime(file.type, file.name)) {
        setError('Whole-book file must be a PDF (.pdf).');
        return;
      }
      if (file.size > DROP_WRITING_PDF_MAX_BYTES) {
        setError(
          `Book PDF must be ${Math.round(DROP_WRITING_PDF_MAX_BYTES / (1024 * 1024))} MB or smaller.`
        );
        return;
      }
      setError(null);
      setBookPdfFile(file);
    },
    []
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
        setBookPdfFile(null);
      } else if (format === 'book') {
        setChapterFiles((prev) =>
          prev.filter((file) =>
            isDropWritingChapterMime(file.type, file.name, 'book')
          )
        );
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
        setTxResult({
          type: 'error',
          msg:
            mode === 'append'
              ? txToastError.variationSetSize(
                  MIN_VARIATIONS,
                  MAX_SET_PIECES.toLocaleString(),
                  next.length.toLocaleString()
                )
              : txToastError.variationSetPickRange(
                  MIN_VARIATIONS,
                  MAX_SET_PIECES.toLocaleString()
                ),
        });
        return;
      }

      const format = next[0].type;
      let totalBytes = 0;
      for (const file of next) {
        if (!isPostImageMime(file.type)) {
          setTxResult({ type: 'error', msg: txToastError.variationImageType });
          return;
        }
        if (file.type !== format) {
          setTxResult({
            type: 'error',
            msg: txToastError.variationFormatMismatch,
          });
          return;
        }
        if (file.size > POST_IMAGE_MAX_BYTES) {
          setTxResult({
            type: 'error',
            msg: txToastError.variationImageTooLarge,
          });
          return;
        }
        totalBytes += file.size;
      }
      if (totalBytes > MAX_SET_TOTAL_BYTES) {
        setTxResult({
          type: 'error',
          msg: txToastError.variationSetTooLarge(
            Math.floor(MAX_SET_TOTAL_BYTES / (1024 * 1024))
          ),
        });
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
    [setTxResult, syncVariationPreviews]
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

  /** Drag reorder — Main follows the same file identity. */
  const reorderVariations = useCallback(
    (from: number, insertAt: number) => {
      const existing = variationFilesRef.current;
      const coverIdx = (() => {
        const seat = Number.parseInt(coverSeatInput, 10);
        return Number.isSafeInteger(seat) &&
          seat >= 1 &&
          seat <= existing.length
          ? seat - 1
          : 0;
      })();
      const coverFile = existing[coverIdx];
      const next = reorderByInsert(existing, from, insertAt);
      if (next === existing) return;
      setVariationFiles(next);
      syncVariationPreviews(next);
      if (coverFile) {
        const moved = next.indexOf(coverFile);
        setCoverSeatInput(String((moved >= 0 ? moved : 0) + 1));
      }
      setError(null);
    },
    [coverSeatInput, syncVariationPreviews]
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
      if (accountId) {
        const client = createAppOnSocialClient(accountId);
        return client.scarces.collections.generateVariationSetStatus(jobId);
      }
      const { accountId: signedId, wallet } = await getSigningWallet();
      const client = createAppScarcesWalletClient(signedId, wallet);
      return client.scarces.collections.generateVariationSetStatus(jobId);
    },
    [accountId, getSigningWallet]
  );

  const persistGenerateJob = useCallback(
    (jobId: string) => {
      setGenerateJobId(jobId);
      if (!accountId) return;
      saveDropPinDraft({
        kind: 'generate-job',
        templateId: templateId === 'custom' ? 'custom' : 'art',
        accountId,
        fingerprint: `generate-job::${jobId}`,
        savedAt: Date.now(),
        jobId,
      });
    },
    [accountId, templateId]
  );

  const clearGenerateJob = useCallback(() => {
    setGenerateJobId(null);
    clearDropPinDraftIfKind(accountId, 'generate-job');
  }, [accountId]);

  // Stay on Generate layers — CIDs are the pinned set, not a source flip.
  const onGenerated = useCallback(
    (result: GeneratedSet) => {
      setVariationsCid(result.artCid);
      setTraitsCid(result.traitsCid);
      setVariationsExt('png');
      setSupplyInput(String(result.count));
      setCoverSeatInput('1');
      setRandomAssign(true);
      setFacets((prev) => ensureGenerativeFacet(prev));
      setGeneratedRarity(result.rarity ?? null);
      setGeneratedNote(
        `Set generated and pinned — ${result.count} pieces ready to mint.`
      );
      setGeneratedPreviews((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return result.previews;
      });
      setVariationSource('generate');
      setGenerateJobId(null);
      clearDropPinDraftIfKind(accountId, 'generate-job');
      setStudioOpen(false);
    },
    [accountId]
  );

  const needsWalletConfirm =
    (isAudio && pinnedMusic != null) ||
    (isWriting && pinnedWriting != null) ||
    (isVariations && variationSource === 'upload' && pinnedLargeSet != null);

  const pinResumeLabel = useMemo(() => {
    if (isAudio && pinnedMusic) {
      const n = pinnedMusic.playable.length;
      return `Pinned · ${n} ${n === 1 ? 'track' : 'tracks'} · ready to sign`;
    }
    if (isWriting && pinnedWriting) {
      const n = pinnedWriting.chapterCount;
      const unit =
        pinnedWriting.writingFormat === 'book'
          ? n === 1
            ? 'chapter'
            : 'chapters'
          : 'manuscript';
      return n > 0 && pinnedWriting.writingFormat === 'book'
        ? `Pinned · ${n} ${unit} · ready to sign`
        : 'Pinned · manuscript · ready to sign';
    }
    if (isVariations && pinnedLargeSet) {
      const n = pinnedLargeSet.pieceCount;
      return `Pinned · ${n} ${n === 1 ? 'piece' : 'pieces'} · ready to sign`;
    }
    return 'Media ready · confirm in wallet to list';
  }, [
    isAudio,
    isWriting,
    isVariations,
    pinnedMusic,
    pinnedWriting,
    pinnedLargeSet,
  ]);

  const hasDiscardableDraft =
    Boolean(title.trim()) ||
    Boolean(slug.trim()) ||
    Boolean(description.trim()) ||
    Boolean(seriesName.trim()) ||
    facets.length > 0 ||
    draftAllowlist.length > 0 ||
    needsWalletConfirm ||
    Boolean(imageFile) ||
    trackFiles.length > 0 ||
    chapterFiles.length > 0 ||
    variationFiles.length > 0;

  const startSummaryRows = useMemo((): DropStartSummaryRow[] => {
    const kindParts = [template.label];
    if (isAudio) {
      kindParts.push(musicFormat === 'album' ? 'Album' : 'Single');
      if (trackFiles.length > 0) {
        kindParts.push(
          `${trackFiles.length} ${trackFiles.length === 1 ? 'track' : 'tracks'}`
        );
      } else if (pinnedMusic) {
        kindParts.push(
          `${pinnedMusic.playable.length} ${
            pinnedMusic.playable.length === 1 ? 'track' : 'tracks'
          }`
        );
      }
    } else if (isWriting) {
      kindParts.push(writingFormat === 'book' ? 'Book' : 'Article');
      const chapterCount =
        chapterFiles.length > 0
          ? chapterFiles.length
          : (pinnedWriting?.chapterCount ?? 0);
      if (chapterCount > 0) {
        kindParts.push(
          `${chapterCount} ${chapterCount === 1 ? 'chapter' : 'chapters'}`
        );
      }
      if (
        writingFormat === 'book' &&
        (bookPdfFile != null || pinnedWriting?.hasBookPdf)
      ) {
        kindParts.push('PDF');
      }
    } else if (isVariations) {
      kindParts.push('Set');
      if (supplyValid) {
        kindParts.push(`${supply} pieces`);
      }
    }

    const royaltyValue =
      resolvedRoyaltyBps == null
        ? '—'
        : resolvedRoyaltyBps <= 0
          ? 'None'
          : `${formatRoyaltyPercent(resolvedRoyaltyBps)}%${
              resolvedRoyaltyShares.length > 1
                ? ` · ${resolvedRoyaltyShares.length} recipients`
                : ''
            }`;

    const rows: DropStartSummaryRow[] = [
      { label: 'Kind', value: kindParts.join(' · ') },
      { label: 'Title', value: title.trim() || '—' },
      {
        label: 'Drop ID',
        value: collectionId || derivedSlug || '—',
      },
      { label: 'Supply', value: `${supply} ${template.unit}` },
      { label: 'Price', value: price ? `${price} NEAR` : 'Free' },
      {
        label: 'Transferable',
        value: transferable ? 'Yes' : 'Soulbound',
      },
      {
        label: isTicket ? 'Allow date changes' : 'Renewable',
        value: renewable ? 'Yes' : 'No',
      },
      { label: 'Royalty', value: royaltyValue },
      {
        label: 'Sale',
        value:
          startTime || endTime
            ? `${startTime ? formatScheduleLabel(startTime) : 'Now'} → ${
                endTime ? formatScheduleLabel(endTime) : 'Sold out'
              }`
            : 'Now → sold out',
      },
    ];

    if (isTicket && (eventStarts || eventEnds)) {
      rows.push({
        label: 'Event',
        value: `${eventStarts ? formatScheduleLabel(eventStarts) : '—'} → ${
          eventEnds ? formatScheduleLabel(eventEnds) : '—'
        }`,
      });
    }
    const placeSlug = normalizePlaceSlug(placeDraft);
    if (isTicket && placeSlug) {
      rows.push({
        label: 'Place',
        value: placeLabel(placeSlug) ?? placeSlug,
      });
    }

    if (appId) {
      rows.push({ label: 'Hub', value: appId });
    }
    const trimmedSeries = seriesName.trim();
    if (trimmedSeries) {
      rows.push({ label: 'Series', value: trimmedSeries });
    }
    // Tickets stamp expires_at from Event ends — skip duplicate Access ends row.
    if (
      !isTicket &&
      (renewable || template.requiresAccessEnd) &&
      accessEnds.trim()
    ) {
      rows.push({
        label: 'Access ends',
        value: formatScheduleLabel(accessEnds),
      });
    }
    if (maxRedeemsInput.trim() && Number.isSafeInteger(maxRedeems)) {
      rows.push({
        label: 'Max redeems',
        value: String(maxRedeems),
      });
    }
    const perWallet = Number.parseInt(maxPerWallet, 10);
    if (Number.isSafeInteger(perWallet) && perWallet > 0) {
      rows.push({
        label: 'Max per wallet',
        value: `${perWallet} ${template.unit}`,
      });
    }
    if (draftAllowlist.length > 0) {
      rows.push({
        label: 'Allowlist',
        value: `${draftAllowlist.length} accounts`,
      });
    }
    const facetLabel = dropFacetsLabel(
      normalizeDropFacets(facets, createFacetMedium)
    );
    if (facetLabel && createFacetMedium) {
      rows.push({
        label: dropFacetFieldLabel(createFacetMedium),
        value: facetLabel,
      });
    }
    return rows;
  }, [
    template.label,
    template.unit,
    isAudio,
    musicFormat,
    trackFiles.length,
    pinnedMusic,
    isWriting,
    writingFormat,
    chapterFiles.length,
    bookPdfFile,
    pinnedWriting,
    isVariations,
    supplyValid,
    supply,
    title,
    collectionId,
    derivedSlug,
    appId,
    price,
    transferable,
    renewable,
    resolvedRoyaltyBps,
    resolvedRoyaltyShares.length,
    startTime,
    endTime,
    eventStarts,
    eventEnds,
    placeDraft,
    isTicket,
    seriesName,
    accessEnds,
    maxRedeemsInput,
    maxRedeems,
    maxPerWallet,
    draftAllowlist.length,
    facets,
    createFacetMedium,
  ]);

  const openStartConfirm = useCallback(async () => {
    setError(null);

    if (!isConnected) {
      await connect();
      return;
    }
    if (
      isVariations &&
      (isGeneratedSet || (isPinnedSet && !pinnedCidValid)) &&
      !generatedSetReady
    ) {
      setVariationSource('generate');
      if (!pinnedCidValid) {
        setVariationsCid('');
        setTraitsCid('');
      }
      setStudioOpen(true);
      setError(
        'Finish generating your set in the studio — then start the drop.'
      );
      return;
    }
    if (
      isVariations &&
      !usePinnedCids &&
      variationFiles.length < MIN_VARIATIONS &&
      !pinnedLargeSet
    ) {
      setError(
        `Add ${MIN_VARIATIONS}–${MAX_SET_PIECES.toLocaleString()} images — one per piece.`
      );
      return;
    }
    if (!isVariations && !imageFile && !pinnedMusic && !pinnedWriting) {
      setError(
        isAudio || isWriting
          ? 'Add cover art for the release.'
          : 'Add artwork for the drop.'
      );
      return;
    }
    if (
      isAudio &&
      !pinnedMusic &&
      !musicTracksValid(musicFormat, trackFiles.length)
    ) {
      setError(
        musicFormat === 'single'
          ? 'Add one track for this single.'
          : `Add 2–${DROP_AUDIO_MAX_TRACKS} tracks for an album.`
      );
      return;
    }
    if (
      isWriting &&
      !pinnedWriting &&
      !writingChaptersValid(writingFormat, chapterFiles.length)
    ) {
      setError(
        writingFormat === 'article'
          ? 'Add a manuscript for this article.'
          : `Add 2–${DROP_WRITING_MAX_CHAPTERS} chapters for a book.`
      );
      return;
    }
    if (!traitsCidValid) {
      setError(
        'That traits folder link doesn’t look valid. Generate layers to pin it automatically.'
      );
      return;
    }
    if (!supplyValid) {
      setError(
        isVariations && !usePinnedCids
          ? `Variation sets are ${MIN_VARIATIONS}–${MAX_SET_PIECES.toLocaleString()} pieces.`
          : usePinnedCids
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
    if (isVariations && collageImages.length > 0 && !collage.blob) {
      setError('Wait for the drop cover collage to finish, then try again.');
      return;
    }
    if (!canSubmit) {
      setError('Add a title, cover art, and supply to start the drop.');
      return;
    }
    if (template.requiresEventEnd && !eventEnds) {
      setError('Set when the event ends — tickets need an event window.');
      return;
    }
    if (template.requiresAccessEnd && !accessEnds) {
      setError(`Set when access ends — ${template.unit} need an expiry date.`);
      return;
    }

    const startNs = localDateTimeToNs(startTime);
    const endNs = localDateTimeToNs(endTime);
    const eventStartsMs = eventStarts
      ? localDateTimeToMs(eventStarts)
      : undefined;
    const eventEndsMs = eventEnds ? localDateTimeToMs(eventEnds) : undefined;
    // Tickets: Event ends is the single end date (also stamps expires_at).
    // Coupons keep their expiry even when renewals are toggled off.
    const expiresAtMs = isTicket
      ? eventEndsMs
      : (renewable || template.requiresAccessEnd) && accessEnds
        ? localDateTimeToMs(accessEnds)
        : undefined;
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const nowMs = Date.now();
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
    if (eventStartsMs != null && eventStartsMs <= nowMs) {
      setError('Event start must be in the future.');
      return;
    }
    if (eventEndsMs != null && eventEndsMs <= nowMs) {
      setError('Event end must be in the future.');
      return;
    }
    if (
      eventStartsMs != null &&
      eventEndsMs != null &&
      eventEndsMs <= eventStartsMs
    ) {
      setError('Event end must be after event start.');
      return;
    }
    if (expiresAtMs != null && expiresAtMs <= nowMs) {
      setError(
        isTicket
          ? 'Event end must be in the future.'
          : 'Access end must be in the future.'
      );
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

    if (!collectionId) {
      setError('Add a title so OnSocial can build a drop ID.');
      return;
    }

    const uploaderAccountId = accountId?.trim();
    if (!uploaderAccountId) {
      await connect();
      return;
    }

    setConfirmPhase(needsWalletConfirm ? 'ready' : 'review');
    setConfirmOpen(true);
  }, [
    isConnected,
    connect,
    isVariations,
    isPinnedSet,
    isGeneratedSet,
    generatedSetReady,
    usePinnedCids,
    pinnedCidValid,
    variationFiles.length,
    pinnedLargeSet,
    imageFile,
    pinnedMusic,
    pinnedWriting,
    isAudio,
    isWriting,
    musicFormat,
    trackFiles.length,
    writingFormat,
    chapterFiles.length,
    traitsCidValid,
    supplyValid,
    maxRedeemsValid,
    coverSeatValid,
    supply,
    canSubmit,
    collage,
    collageImages.length,
    template,
    endTime,
    eventEnds,
    eventStarts,
    isTicket,
    renewable,
    accessEnds,
    startTime,
    resolvedRoyaltyBps,
    resolvedRoyaltyShares,
    draftAllowlist.length,
    collectionId,
    accountId,
    needsWalletConfirm,
  ]);

  const executeStartDrop = useCallback(async () => {
    if (startInFlightRef.current) return;
    startInFlightRef.current = true;
    try {
      const uploaderAccountId = accountId?.trim();
      if (!uploaderAccountId) {
        await connect();
        return;
      }
      if (!collectionId) {
        setError('Add a title so OnSocial can build a drop ID.');
        setConfirmPhase('review');
        return;
      }

      // Ignore cross-kind leftover pins — only the active template may use them.
      const musicPin = isAudio ? pinnedMusic : null;
      const writingPin = isWriting ? pinnedWriting : null;
      const largePin =
        isVariations && variationSource === 'upload' ? pinnedLargeSet : null;
      const hasMatchingPin =
        musicPin != null || writingPin != null || largePin != null;

      // Phase 1 — pin heavy media without touching the wallet. Sheet stays open;
      // wallet approve is a separate confirm once phase is ready.
      if (isAudio && !musicPin) {
        const trackLabel =
          trackFiles.length > 1 ? 'Uploading tracks…' : 'Uploading track…';
        setConfirmPhase('uploading');
        setUploadLabel(trackLabel);
        setPending(true);
        setPendingLabel(trackLabel);
        try {
          const uploadClient = createAppOnSocialClient(uploaderAccountId);
          const uploaded = await uploadClient.storage.uploadMany(trackFiles);
          const playable = uploaded.map((ref, index) => {
            const file = trackFiles[index]!;
            const trackTitle = trackTitleFromFile(file);
            const lyrics = normalizeTrackLyrics(trackLyrics[index]);
            return {
              cid: ref.cid,
              mime: file.type || 'audio/mpeg',
              ...(trackTitle ? { title: trackTitle } : {}),
              ...(lyrics ? { lyrics } : {}),
            };
          });
          setUploadLabel('Uploading cover…');
          setPendingLabel('Uploading cover…');
          const cover = await uploadClient.storage.upload(imageFile!);
          const coverHash = await sha256BlobBase64(imageFile!);
          const pinned = {
            playable,
            coverCid: cover.cid,
            coverHash,
          };
          setPinnedMusic(pinned);
          if (imageFile) {
            saveDropPinDraft({
              kind: 'music',
              templateId: 'audio',
              musicFormat,
              accountId: uploaderAccountId,
              fingerprint: musicPinFingerprint({
                format: musicFormat,
                tracks: trackFiles,
                lyrics: trackLyrics,
                cover: imageFile,
              }),
              savedAt: Date.now(),
              pinned,
            });
          }
          setConfirmPhase('ready');
          setUploadLabel('Uploading…');
        } catch (cause) {
          setConfirmPhase('review');
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

      if (isWriting && !writingPin) {
        const chapterLabel =
          chapterFiles.length > 1
            ? 'Uploading chapters…'
            : 'Uploading manuscript…';
        setConfirmPhase('uploading');
        setUploadLabel(chapterLabel);
        setPending(true);
        setPendingLabel(chapterLabel);
        try {
          const uploadClient = createAppOnSocialClient(uploaderAccountId);
          const uploaded = await uploadClient.storage.uploadMany(chapterFiles);
          const chapters = chaptersFromPinnedFiles(chapterFiles, uploaded);
          let bookPdf: ReturnType<typeof bookPdfRefFromPinnedFile> | undefined;
          if (bookPdfFile && writingFormat === 'book') {
            setUploadLabel('Uploading book PDF…');
            setPendingLabel('Uploading book PDF…');
            const pdfPinned = await uploadClient.storage.upload(bookPdfFile);
            bookPdf = bookPdfRefFromPinnedFile(bookPdfFile, pdfPinned);
          }
          setUploadLabel('Uploading manifesto…');
          setPendingLabel('Uploading manifesto…');
          const manifesto = buildWritingManifest({
            title: title.trim() || undefined,
            chapters,
            ...(bookPdf ? { bookPdf } : {}),
          });
          const manifestoPinned =
            await uploadClient.storage.uploadJson(manifesto);
          setUploadLabel('Uploading cover…');
          setPendingLabel('Uploading cover…');
          const cover = await uploadClient.storage.upload(imageFile!);
          const coverHash = await sha256BlobBase64(imageFile!);
          const pinned = {
            writingManifestCid: manifestoPinned.cid,
            writingFormat,
            chapterCount: chapters.length,
            coverCid: cover.cid,
            coverHash,
            hasBookPdf: Boolean(bookPdf),
          };
          setPinnedWriting(pinned);
          if (imageFile) {
            saveDropPinDraft({
              kind: 'writing',
              templateId: 'writing',
              writingFormat,
              accountId: uploaderAccountId,
              fingerprint: writingPinFingerprint({
                format: writingFormat,
                chapters: chapterFiles,
                cover: imageFile,
                bookPdf: bookPdfFile,
              }),
              savedAt: Date.now(),
              pinned,
            });
          }
          setConfirmPhase('ready');
          setUploadLabel('Uploading…');
        } catch (cause) {
          setConfirmPhase('review');
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

      if (isLargeUpload && !largePin) {
        setConfirmPhase('uploading');
        setUploadLabel('Uploading set…');
        setPending(true);
        setPendingLabel('Uploading set…');
        try {
          const uploadClient = createAppOnSocialClient(uploaderAccountId);
          const { imagesZip } = await buildVariationSetZip(variationFiles);
          const uploaded =
            await uploadClient.scarces.collections.uploadVariationSet({
              imagesZip,
            });
          const pinned = {
            cid: uploaded.variations.cid,
            ext: uploaded.variations.ext,
            pieceCount: variationFiles.length,
          };
          setPinnedLargeSet(pinned);
          saveDropPinDraft({
            kind: 'large-set',
            templateId,
            accountId: uploaderAccountId,
            fingerprint: largeSetPinFingerprint(variationFiles),
            savedAt: Date.now(),
            pinned,
          });
          setConfirmPhase('ready');
          setUploadLabel('Uploading…');
        } catch (cause) {
          setConfirmPhase('review');
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

      const startNs = localDateTimeToNs(startTime);
      const endNs = localDateTimeToNs(endTime);
      const eventStartsMs = eventStarts
        ? localDateTimeToMs(eventStarts)
        : undefined;
      const eventEndsMs = eventEnds ? localDateTimeToMs(eventEnds) : undefined;
      const expiresAtMs = isTicket
        ? eventEndsMs
        : (renewable || template.requiresAccessEnd) && accessEnds
          ? localDateTimeToMs(accessEnds)
          : undefined;
      const perWallet = Number.parseInt(maxPerWallet, 10);

      const trimmedSeries = seriesName.trim();

      // Phase 2 — pins ready (or light path); open wallet + sign immediately.
      setConfirmPhase('listing');
      setPending(true);
      setPendingLabel('Confirm in wallet…');
      try {
        const { accountId: signerId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(signerId, wallet);

        let collageCoverUrl: string | null = null;
        if (isVariations && collage.blob) {
          setPendingLabel('Uploading cover…');
          try {
            const coverFile = new File([collage.blob], 'drop-cover.png', {
              type: 'image/png',
            });
            const pinnedCover = await client.storage.upload(coverFile);
            collageCoverUrl =
              resolveScarceMediaUrl(pinnedCover.cid) ??
              (pinnedCover.cid ? `ipfs://${pinnedCover.cid}` : null);
            if (!collageCoverUrl) {
              throw new Error('Cover upload returned no CID.');
            }
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not upload the drop cover. Try again.'
            );
            setPending(false);
            setPendingLabel('Starting…');
            setConfirmPhase(hasMatchingPin ? 'ready' : 'review');
            return;
          }
          setPendingLabel('Confirm in wallet…');
        }

        const coverMeta =
          isVariations &&
          (collageCoverUrl ||
            (Number.isSafeInteger(coverSeat) && coverSeat >= 1))
            ? {
                cover: {
                  seat: coverSeatValid ? coverSeat : 1,
                  ...(collageCoverUrl ? { url: collageCoverUrl } : {}),
                  ...(collage.blob
                    ? {
                        style: collage.style,
                        label: collage.showLabel,
                        showTitle: collage.showTitle,
                        paper: collage.paper,
                        font: collage.font,
                      }
                    : {}),
                },
              }
            : null;
        const collectionMetadata =
          trimmedSeries || coverMeta
            ? {
                ...(trimmedSeries
                  ? {
                      series: {
                        id: slugify(trimmedSeries),
                        title: trimmedSeries,
                      },
                    }
                  : {}),
                ...(coverMeta ?? {}),
              }
            : null;

        const response = await client.scarces.collections.create(
          {
            collectionId,
            totalSupply: supply,
            title: title.trim(),
            ...(isVariations
              ? usePinnedCids
                ? {
                    variationsCid: variationsCid.trim(),
                    ...(variationsExt !== 'png' ? { variationsExt } : {}),
                  }
                : largePin
                  ? {
                      variationsCid: largePin.cid,
                      ...(largePin.ext !== 'png'
                        ? { variationsExt: largePin.ext }
                        : {}),
                    }
                  : { images: variationFiles }
              : isAudio && musicPin
                ? {
                    mediaCid: musicPin.coverCid,
                    mediaHash: musicPin.coverHash,
                  }
                : isWriting && writingPin
                  ? {
                      mediaCid: writingPin.coverCid,
                      mediaHash: writingPin.coverHash,
                    }
                  : { image: imageFile! }),
            ...(usePinnedCids && traitsCid.trim()
              ? { referenceCid: traitsCid.trim() }
              : {}),
            ...(isVariations && randomAssign ? { randomAssignment: true } : {}),
            transferable,
            renewable,
            extra: {
              ...(template.kind ? { kind: template.kind } : {}),
              ...(isAudio ? { audioFormat: musicFormat } : {}),
              ...(isAudio && musicPin ? { playable: musicPin.playable } : {}),
              ...(isWriting && writingPin
                ? {
                    writingFormat: writingPin.writingFormat,
                    writingManifest: writingPin.writingManifestCid,
                    chapterCount: writingPin.chapterCount,
                  }
                : {}),
              ...(isTicket
                ? ticketEventExtraFields({
                    eventStartsAtMs: eventStartsMs,
                    eventEndsAtMs: eventEndsMs,
                    place: placeDraft,
                  })
                : {}),
              ...dropFacetsExtraFields(facets, createFacetMedium),
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
            ...(resolvedRoyaltyBps != null && resolvedRoyaltyBps > 0
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
          {
            depositYocto: nearToYocto(CREATE_STORAGE_BUFFER_NEAR),
            ...(draftAllowlist.length > 0 ? { allowlist: draftAllowlist } : {}),
          }
        );
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.creatingCollection,
          successMessage: txToastSuccess.collectionCreated,
          failureMessage: txToastError.createCollectionFailed,
        });
        if (!confirmed) {
          setConfirmPhase(hasMatchingPin ? 'ready' : 'review');
          return;
        }

        clearDropPinDraft();
        clearDropFormDraft();
        setPinnedMusic(null);
        setPinnedWriting(null);
        setPinnedLargeSet(null);
        setConfirmOpen(false);
        router.push(collectionPath(collectionId));
      } catch (cause) {
        if (isWalletUserCancellation(cause)) {
          setConfirmPhase(hasMatchingPin ? 'ready' : 'review');
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : txToastError.createCollectionFailed
        );
        setConfirmPhase(hasMatchingPin ? 'ready' : 'review');
      } finally {
        setPending(false);
        setPendingLabel('Starting…');
      }
    } finally {
      startInFlightRef.current = false;
    }
  }, [
    accountId,
    connect,
    collectionId,
    isAudio,
    pinnedMusic,
    trackFiles,
    trackLyrics,
    imageFile,
    musicFormat,
    isWriting,
    pinnedWriting,
    chapterFiles,
    bookPdfFile,
    writingFormat,
    facets,
    title,
    isLargeUpload,
    pinnedLargeSet,
    variationFiles,
    variationSource,
    templateId,
    startTime,
    endTime,
    eventStarts,
    eventEnds,
    placeDraft,
    isTicket,
    renewable,
    accessEnds,
    maxPerWallet,
    seriesName,
    isVariations,
    coverSeat,
    coverSeatValid,
    collage,
    collageImages.length,
    getSigningWallet,
    supply,
    isPinnedSet,
    usePinnedCids,
    variationsCid,
    variationsExt,
    traitsCid,
    randomAssign,
    transferable,
    template,
    price,
    description,
    maxRedeems,
    resolvedRoyaltyBps,
    resolvedRoyaltyShares,
    appId,
    trackTransaction,
    draftAllowlist,
    router,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void openStartConfirm();
  };

  const openFieldInfo = useCallback((key: DropFieldInfoKey) => {
    setFieldInfoKey(key);
  }, []);

  const closeFieldInfo = useCallback(() => {
    setFieldInfoKey(null);
  }, []);

  return (
    <OsAppScreen
      title={studioOpen ? 'Design your set' : appId || 'New drop'}
      backFallbackHref={appId ? appPath(appId) : APP_MARKET_PATH}
      compactChrome
      glassChrome
      scrollRootRef={scrollRootRef}
      style={screenStyle}
      actions={
        studioOpen ? (
          <>
            <OsIconAction
              ariaLabel="How the layer studio works"
              aria-expanded={studioHelpOpen}
              aria-haspopup="dialog"
              onClick={() => setStudioHelpOpen(true)}
            >
              <QuestionMarkCircleFillIcon
                aria-hidden
                className="glass-sheet-close-icon"
              />
            </OsIconAction>
            <OsSheetActions
              layout="row-compact"
              tone="frosted-primary"
              size="sm"
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
            <OsIconAction
              ariaLabel={`About ${template.helpTitle}`}
              aria-expanded={helpOpen}
              aria-haspopup="dialog"
              onClick={() => setHelpOpen(true)}
            >
              <QuestionMarkCircleFillIcon
                aria-hidden
                className="glass-sheet-close-icon"
              />
            </OsIconAction>
            <OsSheetActions
              layout="row-compact"
              tone="frosted-primary"
              size="sm"
              borderless
              className="drop-create-header-cta"
            >
              <OsSheetAction
                type="button"
                variant="primary"
                ready={canSubmit || needsWalletConfirm}
                pending={pending}
                pendingLabel={pendingLabel}
                disabled={
                  pending || (isConnected && !canSubmit && !needsWalletConfirm)
                }
                onClick={() => {
                  void openStartConfirm();
                }}
              >
                {!isConnected && !isLoading
                  ? 'Connect'
                  : needsWalletConfirm
                    ? 'Continue'
                    : 'Start drop'}
              </OsSheetAction>
            </OsSheetActions>
          </>
        )
      }
      toolbar={
        studioOpen ? undefined : (
          <OsAppChromeToolbarRail
            hidden={toolbarHidden}
            className="drop-template-toolbar"
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
          </OsAppChromeToolbarRail>
        )
      }
      leading={
        studioOpen ? (
          <OsIconAction
            ariaLabel="Back to drop details"
            onClick={() => {
              setStudioOpen(false);
            }}
          >
            <ArrowLeftIcon className="glass-sheet-close-icon" aria-hidden />
          </OsIconAction>
        ) : undefined
      }
    >
      {/* The studio is hidden (not unmounted) when closed so uploaded layers
          and an in-flight server render survive stepping back to the form. */}
      {isGeneratedSet || generateJobId ? (
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
            resumeJobId={accountId ? generateJobId : null}
            onJobStarted={persistGenerateJob}
            onJobCleared={clearGenerateJob}
            onDesignChange={setDesign}
          />
        </div>
      ) : null}
      <form
        id={fieldId('form')}
        className="drop-create-form"
        data-keyboard={formKeyboardOpen ? 'open' : undefined}
        style={studioOpen ? { display: 'none' } : undefined}
        onFocusCapture={handleFormFocusCapture}
        onBlurCapture={handleFormBlurCapture}
        onSubmit={handleSubmit}
      >
        <p className="drop-kind-lede" aria-live="polite">
          {template.tagline}
        </p>
        {needsWalletConfirm ? (
          <div className="drop-pin-resume" role="status">
            <p className="drop-media-ready-chip">{pinResumeLabel}</p>
          </div>
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
                : isAudio
                  ? 'Night Drive'
                  : 'Genesis Prints'
            }
            maxLength={MAX_TITLE}
            className={osFieldBorderedClassName}
          />
        </label>

        <div className="guild-field">
          <DropFieldLabel
            label="Description"
            infoKey="description"
            onOpenInfo={openFieldInfo}
          />
          <textarea
            id={fieldId('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              isWriting
                ? 'Short public blurb — the manuscript uploads separately.'
                : 'What fans get and why it matters — shown on the drop page.'
            }
            maxLength={MAX_DESCRIPTION}
            className={osFieldBorderedClassName}
          />
          <small>
            {description.length}/{MAX_DESCRIPTION}
          </small>
        </div>

        {isAudio ? (
          <div className="guild-field">
            <DropFieldLabel
              label="Release"
              infoKey="release"
              onOpenInfo={openFieldInfo}
            />
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
          </div>
        ) : isWriting ? (
          <div className="guild-field">
            <DropFieldLabel
              label="Format"
              infoKey="format"
              onOpenInfo={openFieldInfo}
            />
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
          </div>
        ) : (
          <div className="guild-field">
            <DropFieldLabel
              label="Artwork"
              infoKey="artwork"
              onOpenInfo={openFieldInfo}
            />
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
          </div>
        )}

        {isVariations ? (
          <div className="guild-field">
            <DropFieldLabel
              label="Set source"
              infoKey="setSource"
              onOpenInfo={openFieldInfo}
            />
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
                onClick={() => {
                  setVariationSource('generate');
                  if (!generatedSetReady) setStudioOpen(true);
                }}
              >
                Generate layers
              </button>
            </div>
          </div>
        ) : null}

        {isGeneratedSet && !generatedSetReady ? (
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
                    : 'Bring PNG or WebP layers — stack, generate, start the drop.'}
              </small>
            </span>
          </button>
        ) : null}

        {isVariations && variationSource === 'upload' ? (
          variationFiles.length === 0 ? (
            pinnedLargeSet ? (
              <div className="guild-field">
                <p className="drop-pin-resume-detail">
                  {pinnedLargeSet.pieceCount} pieces pinned · ready to sign
                </p>
                <div
                  className="app-storage-presets"
                  role="group"
                  aria-label="Set actions"
                >
                  <button
                    type="button"
                    className="os-surface-chip"
                    disabled={pending}
                    onClick={() => openVariationPicker('replace')}
                  >
                    Replace set
                  </button>
                </div>
              </div>
            ) : (
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
            )
          ) : (
            <DropVariationSetManager
              previews={variationPreviews}
              totalCount={variationFiles.length}
              coverSeat={coverSeatValid ? coverSeat : 1}
              disabled={pending}
              sortable={!isLargeUpload}
              canAddMore={variationFiles.length < MAX_SET_PIECES}
              onRemove={removeVariationAt}
              onReorder={isLargeUpload ? undefined : reorderVariations}
              onSetCover={(seat) => setCoverSeatInput(String(seat))}
              onAddMore={() => openVariationPicker('append')}
              onReplace={() => openVariationPicker('replace')}
            />
          )
        ) : null}

        {isGeneratedSet && generatedSetReady && generatedNote ? (
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
            {generatedRarity ? (
              <ul className="collection-set-peek-rarity">
                {formatGenerativeRarityLines(generatedRarity).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <div
              className="app-storage-presets"
              role="group"
              aria-label="Set actions"
            >
              <button
                type="button"
                className="os-surface-chip"
                disabled={pending}
                onClick={() => setStudioOpen(true)}
              >
                Continue designing
              </button>
              <button
                type="button"
                className="os-surface-chip"
                disabled={pending}
                onClick={() => {
                  builderRef.current?.reset();
                  setVariationSource('generate');
                  setVariationsCid('');
                  setTraitsCid('');
                  setGeneratedNote(null);
                  setGeneratedRarity(null);
                  setGeneratedPreviews((prev) => {
                    prev.forEach((url) => URL.revokeObjectURL(url));
                    return [];
                  });
                  setGenerateJobId(null);
                  clearDropPinDraftIfKind(accountId, 'generate-job');
                  setStudioOpen(true);
                }}
              >
                Replace set
              </button>
            </div>
          </>
        ) : null}

        {isPinnedSet || generatedSetReady || isLargeUpload ? (
          <label className="guild-field" htmlFor={fieldId('cover-seat')}>
            <span>Cover piece</span>
            <SuffixField
              id={fieldId('cover-seat')}
              value={coverSeatInput}
              onValueChange={(value) =>
                setCoverSeatInput(value.replace(/[^\d]/g, ''))
              }
              placeholder="1"
              aria-label="Cover piece number"
              suffix={supplyValid ? `of ${supply}` : 'piece #'}
              disabled={pending}
            />
            <small>
              Hero piece in the packaging cover. Defaults to piece 1 — each mint
              still keeps its own artwork.
            </small>
          </label>
        ) : null}

        {isVariations && collageImages.length > 0 ? (
          <DropCoverCollagePicker
            images={collageImages}
            coverSeat={coverSeatValid ? coverSeat : 1}
            uniqueCount={supplyValid ? supply : collageImages.length}
            title={title}
            disabled={pending}
            value={collage}
            onChange={setCollage}
          />
        ) : null}

        {isVariations && !isGeneratedSet && !traitsCid.trim() ? (
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
                  isAudio || isWriting ? 'Cover preview' : 'Artwork preview'
                }
              />
              <div
                className="app-storage-presets"
                role="group"
                aria-label={
                  isAudio || isWriting ? 'Cover actions' : 'Artwork actions'
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
          ) : pinnedMusic || pinnedWriting ? (
            <div className="guild-field">
              <p className="drop-pin-resume-detail">
                Cover pinned · re-add only if you need to replace it
              </p>
              <div
                className="app-storage-presets"
                role="group"
                aria-label={
                  isAudio || isWriting ? 'Cover actions' : 'Artwork actions'
                }
              >
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending}
                  onClick={() => imageInputRef.current?.click()}
                >
                  Replace cover
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
                  {isAudio || isWriting ? 'Add cover' : 'Add artwork'}
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
        {isAudio ? (
          <div className="guild-field">
            <span>
              {musicFormat === 'single'
                ? 'Track'
                : `Tracks${trackFiles.length ? ` · ${trackFiles.length}` : ''}`}
            </span>
            {trackFiles.length > 0 ? (
              <DropTrackPreviewList
                files={trackFiles}
                lyrics={trackLyrics}
                disabled={pending}
                sortable={musicFormat === 'album'}
                onRemove={removeTrackAt}
                onReorder={reorderTracks}
                onLyricsChange={setTrackLyricsAt}
              />
            ) : pinnedMusic ? (
              <p className="drop-pin-resume-detail">
                {pinnedMusic.playable.length}{' '}
                {pinnedMusic.playable.length === 1 ? 'track' : 'tracks'} pinned
                · ready to sign
              </p>
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
                    setTrackLyrics([]);
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
            ) : pinnedWriting ? (
              <p className="drop-pin-resume-detail">
                {pinnedWriting.writingFormat === 'book'
                  ? `${pinnedWriting.chapterCount} ${
                      pinnedWriting.chapterCount === 1 ? 'chapter' : 'chapters'
                    } pinned · ready to sign`
                  : 'Manuscript pinned · ready to sign'}
              </p>
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
                ? '.md for the reader · PDF ok · ≤500 KB text / 20 MB PDF'
                : `Drag title to reorder · 2–${DROP_WRITING_MAX_CHAPTERS} · .md for reading`}
            </small>
            <input
              ref={chaptersInputRef}
              type="file"
              accept={
                writingFormat === 'book'
                  ? '.md,.markdown,.txt,text/markdown,text/plain'
                  : '.md,.markdown,.txt,.pdf,text/markdown,text/plain,application/pdf'
              }
              multiple={writingFormat === 'book'}
              className="scarce-cover-file-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending}
              onChange={onChaptersChange}
            />
          </div>
        ) : null}
        {isWriting && writingFormat === 'book' ? (
          <div className="guild-field">
            <DropFieldLabel
              label="Book PDF"
              infoKey="bookPdf"
              onOpenInfo={openFieldInfo}
            />
            {bookPdfFile ? <small>{bookPdfFile.name}</small> : null}
            <div
              className="app-storage-presets"
              role="group"
              aria-label="Book PDF actions"
            >
              <button
                type="button"
                className="os-surface-chip"
                disabled={pending}
                onClick={() => bookPdfInputRef.current?.click()}
              >
                {bookPdfFile ? 'Replace' : 'Add PDF'}
              </button>
              {bookPdfFile ? (
                <button
                  type="button"
                  className="os-surface-chip"
                  disabled={pending}
                  onClick={() => {
                    setBookPdfFile(null);
                    setError(null);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <small>Optional · holders download the full book · ≤20 MB</small>
            <input
              ref={bookPdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="scarce-cover-file-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending}
              onChange={onBookPdfChange}
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

        {isPinnedSet ? (
          <div className="guild-field">
            <DropFieldLabel
              label="Supply"
              infoKey="supplyPinned"
              onOpenInfo={openFieldInfo}
            />
            <SuffixField
              value={supplyInput}
              onValueChange={(value) =>
                setSupplyInput(value.replace(/[^\d]/g, ''))
              }
              placeholder="1000"
              aria-label="Total pieces in the pinned set"
              suffix="pieces"
              disabled={pending}
            />
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
            <SuffixField
              value={supplyInput}
              onValueChange={(value) =>
                setSupplyInput(value.replace(/[^\d]/g, ''))
              }
              placeholder="25"
              aria-label="Total supply"
              suffix={template.unit}
              disabled={pending}
            />
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
          <AmountField
            value={priceInput}
            onValueChange={setPriceInput}
            maxDecimals={NEAR_INPUT_DECIMALS}
            placeholder="1"
            aria-label={`Price per ${template.unitSingular} in NEAR`}
            unit="NEAR"
            disabled={pending}
          />
          <AmountFieldMetaRow
            presets={PRICE_PRESETS}
            selectedValue={price}
            onSelectPreset={setPriceInput}
            presetsAriaLabel="Quick prices"
            disabled={pending}
          />
        </div>

        <div className="guild-field drop-advanced-toggle-row">
          <button
            type="button"
            className="collection-allowlist-toggle"
            disabled={pending}
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((open) => !open)}
          >
            {showAdvanced ? 'Hide advanced' : 'Advanced'}
          </button>
          {hasDiscardableDraft ? (
            <button
              type="button"
              className="collection-allowlist-toggle drop-discard-draft"
              disabled={pending}
              onClick={() => setDiscardDraftOpen(true)}
            >
              Discard draft
            </button>
          ) : null}
        </div>

        {showAdvanced ? (
          <>
            <div className="guild-field">
              <DropFieldLabel
                label="Drop ID"
                infoKey="dropId"
                onOpenInfo={openFieldInfo}
              />
              <input
                id={fieldId('id')}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                placeholder={
                  derivedSlug ||
                  (isWriting
                    ? 'the-quiet-hours'
                    : isAudio
                      ? 'night-drive'
                      : 'genesis-prints')
                }
                maxLength={32}
                className={osFieldBorderedClassName}
              />
              {collectionId ? (
                <small>Public link: {collectionPath(collectionId)}</small>
              ) : null}
            </div>

            <div className="guild-field">
              <DropFieldLabel
                label="Series (optional)"
                infoKey="series"
                onOpenInfo={openFieldInfo}
              />
              <input
                id={fieldId('series')}
                value={seriesName}
                onChange={(event) => setSeriesName(event.target.value)}
                placeholder="Ink Studies"
                maxLength={48}
                disabled={pending}
                className={osFieldBorderedClassName}
              />
            </div>

            {createFacetMedium ? (
              <DropFacetsEditor
                medium={createFacetMedium}
                facets={facets}
                onChange={setFacets}
                disabled={pending}
              />
            ) : null}

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

            {isTicket ? (
              <>
                <div className="guild-field">
                  <DropFieldLabel
                    label="Event window"
                    infoKey="eventWindow"
                    onOpenInfo={openFieldInfo}
                  />
                  <div className="drop-schedule-pair">
                    <div
                      className={`drop-schedule-cell${
                        eventStarts ? ' has-value' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="drop-schedule-cell-main"
                        disabled={pending}
                        onClick={() => setScheduleField('eventStarts')}
                      >
                        <span className="drop-schedule-cell-label">Starts</span>
                        <span className="drop-schedule-cell-value">
                          {eventStarts
                            ? formatScheduleLabel(eventStarts)
                            : 'Optional'}
                        </span>
                      </button>
                      {eventStarts ? (
                        <button
                          type="button"
                          className="drop-schedule-cell-clear"
                          disabled={pending}
                          aria-label="Clear event start"
                          onClick={() => setEventStarts('')}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                    <div
                      className={`drop-schedule-cell${
                        eventEnds ? ' has-value' : ''
                      }`}
                    >
                      <button
                        type="button"
                        className="drop-schedule-cell-main"
                        disabled={pending}
                        onClick={() => setScheduleField('eventEnds')}
                      >
                        <span className="drop-schedule-cell-label">Ends</span>
                        <span className="drop-schedule-cell-value">
                          {eventEnds
                            ? formatScheduleLabel(eventEnds)
                            : 'Required'}
                        </span>
                      </button>
                      {eventEnds ? (
                        <button
                          type="button"
                          className="drop-schedule-cell-clear"
                          disabled={pending}
                          aria-label="Clear event end"
                          onClick={() => setEventEnds('')}
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <label className="guild-field" htmlFor={fieldId('place')}>
                  <DropFieldLabel
                    label="Place"
                    infoKey="eventPlace"
                    onOpenInfo={openFieldInfo}
                  />
                  <input
                    id={fieldId('place')}
                    className={osFieldBorderedClassName}
                    value={placeDraft}
                    disabled={pending}
                    maxLength={64}
                    placeholder="Lisbon, ETH Denver…"
                    autoComplete="off"
                    onChange={(event) => setPlaceDraft(event.target.value)}
                  />
                  {normalizePlaceSlug(placeDraft) ? (
                    <span className="guild-composer-place-hint" aria-hidden>
                      {placeLabel(normalizePlaceSlug(placeDraft)!)}
                    </span>
                  ) : null}
                </label>
              </>
            ) : null}

            <div className="guild-field">
              <DropFieldLabel
                label="Sale window"
                infoKey="saleWindow"
                onOpenInfo={openFieldInfo}
              />
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
            </div>

            <label className="guild-field" htmlFor={fieldId('per-wallet')}>
              <span>Max per wallet</span>
              <SuffixField
                id={fieldId('per-wallet')}
                value={maxPerWallet}
                onValueChange={(value) =>
                  setMaxPerWallet(value.replace(/[^\d]/g, ''))
                }
                placeholder="No limit"
                aria-label={`Max ${template.unit} per wallet`}
                suffix={template.unit}
                disabled={pending}
              />
            </label>

            <div className="guild-field">
              <DropFieldLabel
                label="Transferable"
                infoKey="transferable"
                onOpenInfo={openFieldInfo}
              />
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
            </div>

            <div className="guild-field">
              <DropFieldLabel
                label={isTicket ? 'Allow date changes' : 'Renewable'}
                infoKey="renewable"
                onOpenInfo={openFieldInfo}
              />
              <div
                className="app-access-options"
                role="radiogroup"
                aria-label={isTicket ? 'Allow date changes' : 'Renewable'}
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
                    if (!isTicket) setAccessEnds('');
                  }}
                >
                  No
                </button>
              </div>
            </div>

            {!isTicket && (renewable || template.requiresAccessEnd) ? (
              <div className="guild-field">
                <DropFieldLabel
                  label={
                    template.requiresAccessEnd
                      ? 'Access ends'
                      : 'Access ends (optional)'
                  }
                  infoKey="accessEnds"
                  onOpenInfo={openFieldInfo}
                />
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
                      {accessEnds
                        ? formatScheduleLabel(accessEnds)
                        : template.requiresAccessEnd
                          ? 'Required'
                          : 'No end'}
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
              </div>
            ) : null}

            <div className="guild-field">
              <DropFieldLabel
                label="Max redeems (optional)"
                infoKey="maxRedeems"
                onOpenInfo={openFieldInfo}
              />
              <SuffixField
                id={fieldId('max-redeems')}
                value={maxRedeemsInput}
                onValueChange={(value) =>
                  setMaxRedeemsInput(value.replace(/[^\d]/g, ''))
                }
                placeholder="No limit"
                aria-label="Max redeems per edition"
                suffix="redeems"
                disabled={pending}
              />
            </div>

            <div className="guild-field">
              <DropFieldLabel
                label="Allowlist"
                infoKey="allowlist"
                onOpenInfo={openFieldInfo}
              />
              <div className="app-storage-presets os-choice-chip-row">
                <button
                  type="button"
                  className={`os-surface-chip os-choice-chip${
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
                  <span className="os-choice-chip-value">
                    {draftAllowlist.length === 0
                      ? 'None'
                      : draftAllowlist.length === 1
                        ? '1 account'
                        : `${draftAllowlist.length} accounts`}
                  </span>
                </button>
              </div>
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
        title={template.helpTitle}
        summary={template.tagline}
        detail={template.hint}
      />

      <DiscardConfirmSheet
        open={discardDraftOpen}
        onDiscard={resetCreateForm}
        onKeepEditing={() => setDiscardDraftOpen(false)}
        title="Discard draft?"
        body="Clears this drop form and any pinned media for it."
        discardLabel="Discard draft"
        keepEditingLabel="Keep editing"
      />

      <DropFieldInfoDrawer
        infoKey={fieldInfoKey}
        open={fieldInfoKey != null}
        onClose={closeFieldInfo}
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
              : scheduleField === 'eventStarts'
                ? eventStarts
                : scheduleField === 'eventEnds'
                  ? eventEnds
                  : startTime
        }
        minValue={
          scheduleField === 'closes' && startTime
            ? startTime
            : scheduleField === 'eventEnds' && eventStarts
              ? eventStarts
              : undefined
        }
        maxValue={
          scheduleField === 'opens' && endTime
            ? endTime
            : scheduleField === 'eventStarts' && eventEnds
              ? eventEnds
              : undefined
        }
        onClose={() => setScheduleField(null)}
        onChange={(next) => {
          if (scheduleField === 'closes') setEndTime(next);
          else if (scheduleField === 'access') setAccessEnds(next);
          else if (scheduleField === 'eventStarts') setEventStarts(next);
          else if (scheduleField === 'eventEnds') setEventEnds(next);
          else setStartTime(next);
        }}
      />

      <DropStartConfirmSheet
        open={confirmOpen}
        phase={confirmPhase}
        rows={startSummaryRows}
        note={
          needsWalletConfirm
            ? 'Media is already uploaded.'
            : isAudio || isWriting || isLargeUpload
              ? 'Media uploads first, then you confirm in your wallet.'
              : null
        }
        uploadLabel={uploadLabel}
        onClose={() => {
          if (confirmPhase === 'uploading' || confirmPhase === 'listing')
            return;
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          void executeStartDrop();
        }}
      />

      {accountId ? (
        <CollectionAllowlistSheet
          open={allowlistSheetOpen}
          creatorId={accountId}
          maxPerWallet={(() => {
            const perWallet = Number.parseInt(maxPerWallet, 10);
            return Number.isSafeInteger(perWallet) && perWallet > 0
              ? perWallet
              : null;
          })()}
          initialEntries={draftAllowlist}
          onApply={setDraftAllowlist}
          onClose={() => setAllowlistSheetOpen(false)}
        />
      ) : null}
    </OsAppScreen>
  );
}
