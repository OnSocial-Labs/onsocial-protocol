'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ImageIcon,
  OsSheetAction,
  OsSheetActions,
  OsIconAction,
  QuestionMarkCircleFillIcon,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { SuffixField } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  useEntityIdAvailability,
} from '@/hooks/use-entity-id-availability';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import type { CreatorAccess } from '@/features/scarces/apps-data';
import {
  creatorAccessLabel,
  creatorAccessShort,
} from '@/features/scarces/apps-data';
import { hubCategoriesMetadataFields } from '@/features/scarces/hub-categories';
import {
  HubCreateHelpDrawer,
  HUB_CREATE_HELP_TITLE,
} from '@/features/scarces/hub-create-help-drawer';
import { HubCategoriesEditor } from '@/features/scarces/hub-categories-editor';
import {
  HUB_CREATE_ADD_BANNER,
  HUB_CREATE_ADD_LOGO,
  HUB_CREATE_BANNER_CAPTION,
  HUB_CREATE_LOGO_CAPTION,
  HUB_CREATE_REMOVE_BANNER,
  HUB_CREATE_REMOVE_LOGO,
  hubCreateAboutToggle,
} from '@/features/scarces/hub-create-voice';
import { APP_APPS_PATH, appPath } from '@/lib/app-routes';
import { prepareSquareOpaqueJpeg } from '@/lib/prepare-square-opaque-jpeg';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import { normalizeTopicList } from '@/lib/topic-slug';

import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const MAX_NAME = 60;
const MAX_DESCRIPTION = 500;
const MIN_SLUG = 3;
const MAX_SLUG = 40;
const COMMISSION_PRESETS = [0, 2.5, 5, 10] as const;
const MAX_COMMISSION_PCT = 50;
const ACCESS_MODES: CreatorAccess[] = ['open', 'approval', 'invite_only'];

function fieldId(name: string) {
  return `app-create-${name}`;
}

/** Contract slug rules: lowercase a-z0-9 and single hyphens, 3–40 chars. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG);
}

function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function CreateAppPanel() {
  const router = useRouter();
  const { isConnected, isLoading, connect, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [commissionInput, setCommissionInput] = useState('2.5');
  const [creatorAccess, setCreatorAccess] = useState<CreatorAccess>('open');
  const [categories, setCategories] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [formFieldFocused, setFormFieldFocused] = useState(false);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const formViewport = useVisualViewportSheetMetrics(formFieldFocused);
  const formKeyboardOpen =
    formFieldFocused && formViewport.isMobile && formViewport.lift > 0;

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

  const onLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, or WebP image for the logo.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Logo must be 5 MB or smaller.');
      return;
    }
    try {
      const prepared = await prepareSquareOpaqueJpeg(file);
      setError(null);
      setLogoFile(prepared);
      setLogoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(prepared);
      });
    } catch {
      setError('Could not prepare that logo image.');
    }
  };

  const onBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, or WebP image for the banner.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Banner must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setBannerFile(file);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearLogo = () => {
    setLogoFile(null);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const clearBanner = () => {
    setBannerFile(null);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const screenStyle = useMemo(
    () =>
      ({
        ['--drop-create-keyboard-lift' as string]: formKeyboardOpen
          ? `${formViewport.lift}px`
          : '0px',
      }) as CSSProperties,
    [formKeyboardOpen, formViewport.lift]
  );

  const derivedSlug = useMemo(
    () => slugify(slugTouched ? slug || name : name),
    [slug, name, slugTouched]
  );
  const idAvailability = useEntityIdAvailability('hub', derivedSlug, MIN_SLUG);
  const idAvailabilityClass = entityIdAvailabilityClass(idAvailability);
  const commission = Number.parseFloat(commissionInput);
  const commissionValid =
    Number.isFinite(commission) &&
    commission >= 0 &&
    commission <= MAX_COMMISSION_PCT;

  const canSubmit =
    isConnected &&
    !pending &&
    name.trim().length >= 2 &&
    derivedSlug.length >= MIN_SLUG &&
    commissionValid &&
    normalizeTopicList(categories).length >= 1 &&
    idAvailability !== 'taken' &&
    idAvailability !== 'checking';

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      if (!isConnected) {
        await connect();
        return;
      }
      if (derivedSlug.length < MIN_SLUG) {
        setError(`Hub ID must be at least ${MIN_SLUG} characters.`);
        return;
      }
      if (!commissionValid) {
        setError(`Commission must be between 0 and ${MAX_COMMISSION_PCT}%.`);
        return;
      }
      const normalizedCategories = normalizeTopicList(categories);
      if (normalizedCategories.length < 1) {
        setError('Pick or type a category for this hub.');
        return;
      }

      setPending(true);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        let image: string | undefined;
        let banner: string | undefined;
        if (logoFile) {
          const uploaded = await client.storage.upload(logoFile);
          image = `ipfs://${uploaded.cid}`;
        }
        if (bannerFile) {
          const uploaded = await client.storage.upload(bannerFile);
          banner = `ipfs://${uploaded.cid}`;
        }
        const metadata = JSON.stringify({
          name: name.trim(),
          ...hubCategoriesMetadataFields(normalizedCategories),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(image ? { image } : {}),
          ...(banner ? { banner } : {}),
        });
        const response = await client.scarces.apps.register(derivedSlug, {
          primarySaleBps: pctToBps(commission),
          creatorAccess,
          metadata,
        });
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.creatingApp,
          successMessage: txToastSuccess.appCreated,
          failureMessage: txToastError.createAppFailed,
        });
        if (!confirmed) return;
        router.push(appPath(derivedSlug));
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        const detail =
          cause instanceof Error && cause.message.trim()
            ? cause.message.trim()
            : null;
        setTxResult({
          type: 'error',
          msg:
            detail && !detail.startsWith('{') && detail.length < 160
              ? detail
              : txToastError.createAppFailed,
        });
      } finally {
        setPending(false);
      }
    },
    [
      isConnected,
      connect,
      derivedSlug,
      commissionValid,
      commission,
      name,
      description,
      logoFile,
      bannerFile,
      creatorAccess,
      categories,
      getSigningWallet,
      trackTransaction,
      setTxResult,
      router,
    ]
  );

  return (
    <OsAppScreen
      title="Open a hub"
      dockBack
      backFallbackHref={APP_APPS_PATH}
      glassChrome
      style={screenStyle}
      actions={
        <OsIconAction
          ariaLabel={HUB_CREATE_HELP_TITLE}
          aria-expanded={helpOpen}
          aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}
        >
          <QuestionMarkCircleFillIcon
            aria-hidden
            className="glass-sheet-close-icon"
          />
        </OsIconAction>
      }
    >
      <form
        className="drop-create-form"
        data-form-focused={formFieldFocused ? '' : undefined}
        data-keyboard={formKeyboardOpen ? 'open' : undefined}
        onFocusCapture={handleFormFocusCapture}
        onBlurCapture={handleFormBlurCapture}
        onSubmit={handleSubmit}
      >
        <section className="dao-create-media hub-create-media" aria-label="Hub look">
          {bannerPreview ? (
            <div className="dao-create-media-preview">
              <img
                src={bannerPreview}
                alt=""
                className="dao-create-media-el dao-create-media-el--cover"
              />
              <button
                type="button"
                className="dao-create-media-remove"
                disabled={pending}
                onClick={clearBanner}
              >
                {HUB_CREATE_REMOVE_BANNER}
              </button>
            </div>
          ) : (
            <div className="dao-create-media-slot">
              <button
                type="button"
                className="os-write-dock-tool"
                aria-label={HUB_CREATE_ADD_BANNER}
                disabled={pending}
                onClick={() => bannerInputRef.current?.click()}
              >
                <ImageIcon className="os-write-dock-media-icon" aria-hidden />
              </button>
              <span className="dao-create-media-caption" aria-hidden>
                {HUB_CREATE_BANNER_CAPTION}
              </span>
            </div>
          )}
          {logoPreview ? (
            <div className="dao-create-media-preview">
              <img
                src={logoPreview}
                alt=""
                className="dao-create-media-el dao-create-media-el--crest"
              />
              <button
                type="button"
                className="dao-create-media-remove"
                disabled={pending}
                onClick={clearLogo}
              >
                {HUB_CREATE_REMOVE_LOGO}
              </button>
            </div>
          ) : (
            <div className="dao-create-media-slot">
              <button
                type="button"
                className="os-write-dock-tool"
                aria-label={HUB_CREATE_ADD_LOGO}
                disabled={pending}
                onClick={() => logoInputRef.current?.click()}
              >
                <ImageIcon className="os-write-dock-media-icon" aria-hidden />
              </button>
              <span className="dao-create-media-caption" aria-hidden>
                {HUB_CREATE_LOGO_CAPTION}
              </span>
            </div>
          )}
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-hub-create-file="banner"
            className="account-editor-file-input"
            tabIndex={-1}
            aria-hidden
            disabled={pending}
            onChange={onBannerChange}
          />
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            data-hub-create-file="logo"
            className="account-editor-file-input"
            tabIndex={-1}
            aria-hidden
            disabled={pending}
            onChange={(event) => {
              void onLogoChange(event);
            }}
          />
        </section>

        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              // Name is source of truth — re-link ID after any name edit.
              setSlugTouched(false);
            }}
            onFocus={scrollFieldIntoView}
            placeholder="Midnight Records"
            maxLength={MAX_NAME}
            disabled={pending}
            className={osFieldBorderedClassName}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Hub ID</span>
          <input
            id={fieldId('id')}
            value={slugTouched ? slug : derivedSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            onFocus={scrollFieldIntoView}
            placeholder="midnight-records"
            maxLength={MAX_SLUG}
            disabled={pending}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-invalid={idAvailability === 'taken'}
            className={`${osFieldBorderedClassName} ${idAvailabilityClass}`}
          />
          <small className={idAvailabilityClass}>
            {entityIdAvailabilityLead(idAvailability)} ·{' '}
            {appPath(derivedSlug || 'your-hub')}
          </small>
        </label>

        <button
          type="button"
          className="collection-allowlist-toggle"
          aria-expanded={aboutOpen}
          disabled={pending}
          onClick={() => setAboutOpen((open) => !open)}
        >
          {hubCreateAboutToggle({
            open: aboutOpen,
            hasText: description.trim().length > 0,
          })}
        </button>
        {aboutOpen ? (
          <label className="guild-field" htmlFor={fieldId('description')}>
            <span>About</span>
            <textarea
              id={fieldId('description')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onFocus={scrollFieldIntoView}
              placeholder="What this hub publishes and who it's for."
              maxLength={MAX_DESCRIPTION}
              disabled={pending}
              aria-describedby={fieldId('description-count')}
              className={osFieldBorderedClassName}
            />
            <small id={fieldId('description-count')}>
              {description.length}/{MAX_DESCRIPTION}
            </small>
          </label>
        ) : null}

        <label className="guild-field" htmlFor={fieldId('commission')}>
          <span>Your commission</span>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Commission presets"
          >
            {COMMISSION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`os-surface-chip${
                  commission === preset ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setCommissionInput(String(preset))}
              >
                {preset}%
              </button>
            ))}
          </div>
          <SuffixField
            id={fieldId('commission')}
            value={commissionInput}
            inputMode="decimal"
            onValueChange={(value) =>
              setCommissionInput(value.replace(/[^\d.]/g, ''))
            }
            onFocus={scrollFieldIntoView}
            placeholder="2.5"
            aria-label="Commission percentage"
            suffix="% per sale"
            disabled={pending}
          />
          <small>Locked on each new drop · max {MAX_COMMISSION_PCT}%.</small>
        </label>

        <div className="guild-field">
          <span>Category</span>
          <HubCategoriesEditor
            categories={categories}
            onChange={setCategories}
            id={fieldId('categories')}
            disabled={pending}
          />
        </div>

        <div className="guild-field">
          <span>Who can create drops</span>
          <div
            className="app-storage-presets"
            role="radiogroup"
            aria-label="Who can create drops"
          >
            {ACCESS_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={creatorAccess === mode}
                className={`os-surface-chip${
                  creatorAccess === mode ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setCreatorAccess(mode)}
              >
                {creatorAccessShort(mode)}
              </button>
            ))}
          </div>
          <small>{creatorAccessLabel(creatorAccess)}</small>
        </div>

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
          <OsSheetAction
            type="submit"
            ready={canSubmit}
            pending={pending}
            pendingLabel="Opening…"
            disabled={!canSubmit}
          >
            Open hub
          </OsSheetAction>
        </OsSheetActions>
      </form>
      <HubCreateHelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </OsAppScreen>
  );
}
