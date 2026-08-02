'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  OsSheetAction,
  OsSheetActions,
  OsSheetPrimaryAction,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import {
  APP_MARKET_PATH,
  MARKET_APP_PARAM,
  appPath,
  collectionPath,
} from '@/lib/app-routes';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const NEAR_INPUT_DECIMALS = 5;
const SUPPLY_PRESETS = [10, 25, 100, 500] as const;
const MIN_SUPPLY = 1;
const MAX_SUPPLY = 10_000;
const MIN_VARIATIONS = 2;
const MAX_VARIATIONS = 50;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 500;

type DropMedium = 'art' | 'book' | 'music';

/** One shared artwork minted N times, or one artwork per token. */
type DropArtMode = 'single' | 'variations';

const MEDIUM_OPTIONS: { id: DropMedium; label: string; hint: string }[] = [
  { id: 'art', label: 'Art', hint: 'Transferable prints' },
  { id: 'book', label: 'Book', hint: 'Soulbound · renewable' },
  { id: 'music', label: 'Music', hint: 'Transferable · redeemable' },
];

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

/** Local datetime input → nanoseconds since epoch, or undefined. */
function localDateTimeToNs(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return undefined;
  return String(ms * 1_000_000);
}

function applyMediumDefaults(medium: DropMedium): {
  transferable: boolean;
  renewable: boolean;
} {
  if (medium === 'book') {
    return { transferable: false, renewable: true };
  }
  if (medium === 'music') {
    return { transferable: true, renewable: false };
  }
  return { transferable: true, renewable: false };
}

export function CreateDropPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appId = searchParams.get(MARKET_APP_PARAM)?.trim() ?? '';
  const { isConnected, isLoading, connect, getSigningWallet } = useAppWallet();
  const { trackTransaction } = useAppTransactionFeedback();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [supplyInput, setSupplyInput] = useState('25');
  const [priceInput, setPriceInput] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [maxPerWallet, setMaxPerWallet] = useState('');
  const [medium, setMedium] = useState<DropMedium>('art');
  const [transferable, setTransferable] = useState(true);
  const [renewable, setRenewable] = useState(false);
  const [maxRedeemsInput, setMaxRedeemsInput] = useState('');
  const [allowlistOnly, setAllowlistOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [artMode, setArtMode] = useState<DropArtMode>('single');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [variationFiles, setVariationFiles] = useState<File[]>([]);
  const [variationPreviews, setVariationPreviews] = useState<string[]>([]);
  const [seriesName, setSeriesName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const variationsInputRef = useRef<HTMLInputElement>(null);

  const isVariations = artMode === 'variations';
  const derivedSlug = useMemo(() => slugify(slug || title), [slug, title]);
  const editionSupply = Number.parseInt(supplyInput, 10);
  const supply = isVariations ? variationFiles.length : editionSupply;
  const price = finalizeAmountInput(priceInput, NEAR_INPUT_DECIMALS);
  const supplyValid = isVariations
    ? variationFiles.length >= MIN_VARIATIONS &&
      variationFiles.length <= MAX_VARIATIONS
    : Number.isSafeInteger(editionSupply) &&
      editionSupply >= MIN_SUPPLY &&
      editionSupply <= MAX_SUPPLY;
  const maxRedeems = Number.parseInt(maxRedeemsInput, 10);
  const maxRedeemsValid =
    !maxRedeemsInput.trim() ||
    (Number.isSafeInteger(maxRedeems) && maxRedeems >= 1);

  const canSubmit =
    isConnected &&
    !pending &&
    title.trim().length >= 2 &&
    derivedSlug.length >= 3 &&
    supplyValid &&
    maxRedeemsValid &&
    (isVariations
      ? variationFiles.length >= MIN_VARIATIONS
      : imageFile != null);

  const selectMedium = useCallback((next: DropMedium) => {
    const defaults = applyMediumDefaults(next);
    setMedium(next);
    setTransferable(defaults.transferable);
    setRenewable(defaults.renewable);
    if (next !== 'music') setMaxRedeemsInput('');
  }, []);

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

  const onVariationsChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length === 0) return;
      if (files.length < MIN_VARIATIONS || files.length > MAX_VARIATIONS) {
        setError(
          `Pick ${MIN_VARIATIONS}–${MAX_VARIATIONS} images — one per piece.`
        );
        return;
      }
      const format = files[0].type;
      for (const file of files) {
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
      }
      setError(null);
      setVariationFiles(files);
      setVariationPreviews((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return files.map((file) => URL.createObjectURL(file));
      });
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      if (!isConnected) {
        await connect();
        return;
      }
      if (isVariations && variationFiles.length < MIN_VARIATIONS) {
        setError(
          `Add ${MIN_VARIATIONS}–${MAX_VARIATIONS} images — one per piece.`
        );
        return;
      }
      if (!isVariations && !imageFile) {
        setError('Add cover art for the drop.');
        return;
      }
      if (!supplyValid) {
        setError(
          isVariations
            ? `Variation sets are ${MIN_VARIATIONS}–${MAX_VARIATIONS} pieces.`
            : `Supply must be between ${MIN_SUPPLY} and ${MAX_SUPPLY}.`
        );
        return;
      }
      if (!maxRedeemsValid) {
        setError('Max redeems must be a positive whole number.');
        return;
      }
      if (!canSubmit) {
        setError('Add a title, cover art, and supply to start the drop.');
        return;
      }

      const startNs = localDateTimeToNs(startTime);
      const endNs = localDateTimeToNs(endTime);
      if (startNs && endNs && BigInt(endNs) <= BigInt(startNs)) {
        setError('The close time must be after the open time.');
        return;
      }
      const perWallet = Number.parseInt(maxPerWallet, 10);

      // Unique per contract — slug plus a short time-based suffix.
      const collectionId = `${derivedSlug}-${Date.now().toString(36)}`;

      const trimmedSeries = seriesName.trim();
      const seriesMetadata = trimmedSeries
        ? { series: { id: slugify(trimmedSeries), title: trimmedSeries } }
        : null;

      setPending(true);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        const response = await client.scarces.collections.create({
          collectionId,
          totalSupply: supply,
          title: title.trim(),
          ...(isVariations
            ? { images: variationFiles }
            : { image: imageFile! }),
          transferable,
          renewable,
          extra: { kind: medium },
          ...(seriesMetadata ? { metadata: seriesMetadata } : {}),
          ...(price ? { priceNear: price } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(startNs ? { startTime: startNs } : {}),
          ...(endNs ? { endTime: endNs } : {}),
          ...(Number.isSafeInteger(perWallet) && perWallet > 0
            ? { maxPerWallet: perWallet }
            : {}),
          ...(medium === 'music' &&
          Number.isSafeInteger(maxRedeems) &&
          maxRedeems >= 1
            ? { maxRedeems }
            : {}),
          ...(allowlistOnly ? { mintMode: 'allowlist' } : {}),
          ...(appId ? { appId } : {}),
        });
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.creatingCollection,
          successMessage: txToastSuccess.collectionCreated,
          failureMessage: txToastError.createCollectionFailed,
        });
        if (!confirmed) return;
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
      }
    },
    [
      isConnected,
      connect,
      imageFile,
      isVariations,
      variationFiles,
      seriesName,
      supplyValid,
      maxRedeemsValid,
      canSubmit,
      startTime,
      endTime,
      maxPerWallet,
      derivedSlug,
      supply,
      title,
      price,
      description,
      transferable,
      renewable,
      medium,
      maxRedeems,
      allowlistOnly,
      appId,
      getSigningWallet,
      trackTransaction,
      router,
    ]
  );

  return (
    <OsAppScreen
      title="Start a drop"
      subtitle="A supply-capped edition set fans mint until it sells out — with an optional open window."
      backFallbackHref={appId ? appPath(appId) : APP_MARKET_PATH}
    >
      <form className="drop-create-form" onSubmit={handleSubmit}>
        {appId ? (
          <p className="drop-create-app-note">
            Publishing to <strong>{appId}</strong>
          </p>
        ) : null}
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
              ? 'One image per piece — collectors receive the next piece in order. The set is sealed when the drop starts.'
              : 'Every edition shares the same artwork.'}
          </small>
        </div>

        {isVariations ? (
          <button
            type="button"
            className={`drop-cover-picker${
              variationPreviews.length > 0 ? ' has-media' : ''
            }`}
            onClick={() => variationsInputRef.current?.click()}
            disabled={pending}
          >
            {variationPreviews.length > 0 ? (
              <span className="drop-variations-grid">
                {variationPreviews.slice(0, 8).map((src, index) => (
                  <img
                    key={src}
                    src={src}
                    alt={`Variation ${index + 1} preview`}
                  />
                ))}
                {variationPreviews.length > 8 ? (
                  <span className="drop-variations-more">
                    +{variationPreviews.length - 8}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="drop-cover-placeholder">
                <strong>Add your set</strong>
                <small>
                  {MIN_VARIATIONS}–{MAX_VARIATIONS} images · one format · up to
                  5 MB each
                </small>
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            className={`drop-cover-picker${imagePreview ? ' has-media' : ''}`}
            onClick={() => imageInputRef.current?.click()}
            disabled={pending}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Drop cover preview" />
            ) : (
              <span className="drop-cover-placeholder">
                <strong>Add cover art</strong>
                <small>JPG, PNG, or WebP · up to 5 MB</small>
              </span>
            )}
          </button>
        )}
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

        <div className="guild-field">
          <span>Medium</span>
          <div
            className="app-access-options"
            role="radiogroup"
            aria-label="Drop medium"
          >
            {MEDIUM_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={medium === option.id}
                className={`app-access-option${
                  medium === option.id ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => selectMedium(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <small>
            {MEDIUM_OPTIONS.find((option) => option.id === medium)?.hint}
          </small>
        </div>

        <label className="guild-field" htmlFor={fieldId('title')}>
          <span>Title</span>
          <input
            id={fieldId('title')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Genesis Prints"
            maxLength={MAX_TITLE}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Drop ID</span>
          <input
            id={fieldId('id')}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder={derivedSlug || 'genesis-prints'}
            maxLength={32}
          />
          <small>
            Public link: {collectionPath(derivedSlug || 'your-drop')}
          </small>
        </label>

        <label className="guild-field" htmlFor={fieldId('description')}>
          <span>Description</span>
          <textarea
            id={fieldId('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What the collection is, why it’s special, and what collectors get."
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

        {isVariations ? (
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
            <div className="app-storage-amount-field">
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
                className="app-storage-amount-input"
                disabled={pending}
              />
              <span className="account-card-balance-unit">editions</span>
            </div>
          </div>
        )}

        <label className="guild-field" htmlFor={fieldId('price')}>
          <span>Price per edition</span>
          <div className="app-storage-amount-field">
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
              placeholder="0 for free"
              aria-label="Price per edition in NEAR"
              className="app-storage-amount-input"
              disabled={pending}
            />
            <span className="account-card-balance-unit">NEAR</span>
          </div>
        </label>

        <div className="drop-schedule-grid">
          <label className="guild-field" htmlFor={fieldId('start')}>
            <span>Opens (optional)</span>
            <input
              id={fieldId('start')}
              type="datetime-local"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              disabled={pending}
            />
          </label>
          <label className="guild-field" htmlFor={fieldId('end')}>
            <span>Closes (optional)</span>
            <input
              id={fieldId('end')}
              type="datetime-local"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              disabled={pending}
            />
          </label>
        </div>

        <label className="guild-field" htmlFor={fieldId('per-wallet')}>
          <span>Max per wallet (optional)</span>
          <div className="app-storage-amount-field">
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
              aria-label="Max editions per wallet"
              className="app-storage-amount-input"
              disabled={pending}
            />
            <span className="account-card-balance-unit">per wallet</span>
          </div>
        </label>

        {medium === 'book' ? (
          <div className="guild-field">
            <span>Renewable</span>
            <div
              className="app-access-options"
              role="radiogroup"
              aria-label="Renewable editions"
            >
              <button
                type="button"
                role="radio"
                aria-checked={renewable}
                className={`app-access-option${renewable ? ' is-selected' : ''}`}
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
                onClick={() => setRenewable(false)}
              >
                No
              </button>
            </div>
            <small>Let collectors renew access after the term ends.</small>
          </div>
        ) : null}

        {medium === 'music' ? (
          <label className="guild-field" htmlFor={fieldId('max-redeems')}>
            <span>Max redeems (optional)</span>
            <div className="app-storage-amount-field">
              <input
                id={fieldId('max-redeems')}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={maxRedeemsInput}
                onChange={(event) =>
                  setMaxRedeemsInput(event.target.value.replace(/[^\d]/g, ''))
                }
                placeholder="Unlimited"
                aria-label="Max redeems per edition"
                className="app-storage-amount-input"
                disabled={pending}
              />
              <span className="account-card-balance-unit">redeems</span>
            </div>
          </label>
        ) : null}

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
              <span>Transferable</span>
              <div
                className="app-access-options"
                role="radiogroup"
                aria-label="Transferable editions"
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

            {medium !== 'book' ? (
              <div className="guild-field">
                <span>Renewable</span>
                <div
                  className="app-access-options"
                  role="radiogroup"
                  aria-label="Renewable editions"
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
                    onClick={() => setRenewable(false)}
                  >
                    No
                  </button>
                </div>
              </div>
            ) : null}

            <div className="guild-field">
              <span>Mint mode</span>
              <div
                className="app-access-options"
                role="radiogroup"
                aria-label="Mint mode"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!allowlistOnly}
                  className={`app-access-option${
                    !allowlistOnly ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setAllowlistOnly(false)}
                >
                  Open
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={allowlistOnly}
                  className={`app-access-option${
                    allowlistOnly ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setAllowlistOnly(true)}
                >
                  Allowlist only
                </button>
              </div>
              <small>
                Allowlist-only drops need an allowlist before collectors can
                mint.
              </small>
            </div>
          </>
        ) : null}

        {error ? <p className="guild-form-error">{error}</p> : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {!isConnected && !isLoading ? (
            <OsSheetAction
              type="button"
              variant="ghost"
              onClick={() => void connect()}
            >
              Connect wallet
            </OsSheetAction>
          ) : null}
          <OsSheetPrimaryAction
            type="submit"
            ready={canSubmit}
            pending={pending}
            pendingLabel="Starting…"
            disabled={!canSubmit}
          >
            Start drop
          </OsSheetPrimaryAction>
        </OsSheetActions>
      </form>
    </OsAppScreen>
  );
}
