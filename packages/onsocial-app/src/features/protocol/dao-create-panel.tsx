'use client';

import {
  useCallback,
  useEffect,
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
  DiscardConfirmSheet,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { rememberCommunityDao } from '@/features/protocol/dao-accounts';
import { buildDaoBrandingMetadata } from '@/features/protocol/dao-branding';
import {
  DAO_CREATE_ADVANCED,
  DAO_CREATE_ADVANCED_HIDE,
  DAO_CREATE_CONNECT_CTA,
  DAO_CREATE_CONNECT_HINT,
  DAO_CREATE_FORM_ID,
  DAO_CREATE_PUBLISH,
  DAO_CREATE_TITLE,
  daoCreateNearShortHint,
  daoCreatePurposeToggle,
  daoCreateWhisper,
} from '@/features/protocol/dao-create-voice';
import {
  buildDaoFactoryAccountId,
  DAO_FACTORY_NAME_MAX,
  DAO_FACTORY_PURPOSE_MAX,
  DAO_FACTORY_SLUG_MIN,
  daoCreateAttachNearLabel,
  daoCreateNearShortfallYocto,
  daoFactoryCreatePolicyFacts,
  isValidDaoFactorySlug,
  normalizeDaoFactorySlug,
  probeDaoFactoryAccountTaken,
  submitDaoFactoryCreate,
} from '@/features/protocol/dao-factory-create';
import { buildDaoSocialProfileProposalPayload } from '@/features/protocol/dao-social-profile';
import { DaoLookPreview } from '@/features/protocol/dao-look-preview';
import { rememberOptimisticMyDao } from '@/features/protocol/my-daos-optimistic';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { useVisualViewportSheetMetrics } from '@/hooks/use-visual-viewport-sheet';
import { useWalletNearBalance } from '@/hooks/use-wallet-near-balance';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  type EntityIdAvailability,
} from '@/hooks/use-entity-id-availability';
import { SPUTNIK_DAO_FACTORY } from '@/lib/app-config';
import { yoctoToNear } from '@/lib/app-near-rpc';
import { APP_DAOS_PATH, daoPath } from '@/lib/app-routes';
import { DAO_CREATE_FORM_CLASS } from '@/lib/os-create-page';
import { prepareSquareOpaqueJpeg } from '@/lib/prepare-square-opaque-jpeg';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import {
  normalizeProfileLinksInput,
  profileLinkEditorFieldErrors,
  profileLinksInputFromRecord,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function fieldId(name: string) {
  return `dao-create-${name}`;
}

function isFormFieldTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function daoAccountIdLead(status: EntityIdAvailability): string {
  if (status === 'idle') return 'Permanent';
  return entityIdAvailabilityLead(status);
}

function useDaoFactorySlugAvailability(
  daoAccountId: string,
  minLength: number
): EntityIdAvailability {
  const [probe, setProbe] = useState<{
    id: string;
    value: Exclude<EntityIdAvailability, 'idle'>;
  } | null>(null);
  const trimmed = daoAccountId.trim().toLowerCase();
  const slug = trimmed.includes('.')
    ? trimmed.slice(0, trimmed.indexOf('.'))
    : trimmed;
  const ready = slug.length >= minLength && isValidDaoFactorySlug(slug);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setProbe({ id: trimmed, value: 'checking' });
      void probeDaoFactoryAccountTaken(trimmed)
        .then((taken) => {
          if (!cancelled) {
            setProbe({ id: trimmed, value: taken ? 'taken' : 'available' });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProbe({ id: trimmed, value: 'available' });
          }
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, ready]);

  if (!ready) return 'idle';
  if (!probe || probe.id !== trimmed) return 'checking';
  return probe.value;
}

/**
 * Factory DAO create — first-class place from the DAOs directory.
 * Dock Back leaves to DAOs (discard confirm when dirty). Footer owns Connect.
 */
export function DaoCreatePanel() {
  const router = useRouter();
  const { accountId, isConnected, connect, getSigningWallet } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const policyFacts = useMemo(() => daoFactoryCreatePolicyFacts(), []);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [links, setLinks] = useState<ProfileLinksInput>(() =>
    profileLinksInputFromRecord(null)
  );
  const [linkErrors, setLinkErrors] = useState<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const [linksOpen, setLinksOpen] = useState(false);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [publishSocial, setPublishSocial] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formFieldFocused, setFormFieldFocused] = useState(false);
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const formViewport = useVisualViewportSheetMetrics(formFieldFocused);
  const formKeyboardOpen =
    formFieldFocused && formViewport.isMobile && formViewport.lift > 0;
  const avatarPreviewRef = useRef<string | null>(null);
  const bannerPreviewRef = useRef<string | null>(null);
  avatarPreviewRef.current = avatarPreview;
  bannerPreviewRef.current = bannerPreview;

  const walletNear = useWalletNearBalance(accountId, isConnected);
  const nearShortfall = daoCreateNearShortfallYocto(
    walletNear.balanceYocto,
    publishSocial
  );
  const dealNearLabel = daoCreateAttachNearLabel(publishSocial);

  useEffect(() => {
    return () => {
      if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current);
      if (bannerPreviewRef.current) URL.revokeObjectURL(bannerPreviewRef.current);
    };
  }, []);

  const leaveToDaos = useCallback(() => {
    router.push(APP_DAOS_PATH);
  }, [router]);

  const dirty =
    name.trim().length > 0 ||
    purpose.trim().length > 0 ||
    avatarFile != null ||
    bannerFile != null ||
    publishSocial ||
    (slugTouched && slug.trim().length > 0) ||
    Object.values(links).some((value) => value.trim().length > 0);

  const {
    discardConfirmOpen,
    requestCloseOrConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({
    open: true,
    dirty,
    pending,
    onClose: leaveToDaos,
  });

  const handleDockBack = useCallback(() => {
    if (requestCloseOrConfirm()) {
      leaveToDaos();
    }
  }, [requestCloseOrConfirm, leaveToDaos]);

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

  const resolvedSlug = useMemo(
    () => normalizeDaoFactorySlug(slugTouched ? slug || name : name),
    [name, slug, slugTouched]
  );
  const daoAccountId = useMemo(
    () => buildDaoFactoryAccountId(resolvedSlug),
    [resolvedSlug]
  );
  const idAvailability = useDaoFactorySlugAvailability(
    daoAccountId,
    DAO_FACTORY_SLUG_MIN
  );
  const idAvailabilityClass = entityIdAvailabilityClass(idAvailability);

  const formReady =
    isValidDaoFactorySlug(resolvedSlug) &&
    name.trim().length >= 2 &&
    !pending &&
    idAvailability !== 'taken' &&
    idAvailability !== 'checking' &&
    Object.keys(profileLinkEditorFieldErrors(links)).length === 0;
  const canSubmit = formReady && nearShortfall == null;

  const footerState = useMemo((): CommerceSheetFooterState => {
    if (!isConnected) {
      return {
        visible: true,
        primaryLabel: DAO_CREATE_CONNECT_CTA,
        primaryPendingLabel: 'Connecting…',
        canSubmit: true,
        pending: false,
        primaryType: 'button',
        onPrimaryClick: () => {
          void connect();
        },
      };
    }
    return {
      visible: true,
      primaryLabel: DAO_CREATE_TITLE,
      primaryPendingLabel: 'Confirm in wallet…',
      canSubmit,
      pending,
      disabled: pending || !canSubmit,
      primaryType: 'submit',
    };
  }, [isConnected, connect, canSubmit, pending]);

  const onAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, or WebP image for the crest.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Crest must be 5 MB or smaller.');
      return;
    }
    try {
      const prepared = await prepareSquareOpaqueJpeg(file);
      setError(null);
      setAvatarFile(prepared);
      setAvatarPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(prepared);
      });
    } catch {
      setError('Could not prepare that crest image.');
    }
  };

  const onBannerChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!isPostImageMime(file.type)) {
      setError('Use a JPG, PNG, WebP, or GIF for the cover.');
      return;
    }
    if (file.size > POST_IMAGE_MAX_BYTES) {
      setError('Cover must be 5 MB or smaller.');
      return;
    }
    setError(null);
    setBannerFile(file);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview((prev) => {
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isConnected || !accountId) {
      await connect();
      return;
    }

    const nextLinkErrors = profileLinkEditorFieldErrors(links);
    if (Object.keys(nextLinkErrors).length > 0) {
      setLinkErrors(nextLinkErrors);
      setLinksOpen(true);
      setShowAdvanced(true);
      setError('Fix the link fields before creating.');
      return;
    }

    if (nearShortfall != null) return;

    if (!formReady) {
      if (idAvailability === 'taken') {
        setError('That account id is taken — pick another.');
        return;
      }
      setError('Add a name and a valid account id.');
      return;
    }

    setPending(true);
    try {
      const { client } = await getClient();
      let avatar: string | null = null;
      let banner: string | null = null;
      if (avatarFile) {
        const uploaded = await client.storage.upload(avatarFile);
        avatar = `ipfs://${uploaded.cid}`;
      }
      if (bannerFile) {
        const uploaded = await client.storage.upload(bannerFile);
        banner = `ipfs://${uploaded.cid}`;
      }
      const normalizedLinks = normalizeProfileLinksInput(links, undefined);
      const metadata = buildDaoBrandingMetadata('', {
        name: name.trim(),
        description: purpose.trim() || null,
        avatar,
        banner,
        links: Object.keys(normalizedLinks).length > 0 ? normalizedLinks : null,
      });

      const { accountId: signerId, wallet } = await getSigningWallet();
      const { daoAccountId: createdId, txHashes } =
        await submitDaoFactoryCreate({
          wallet,
          accountId: signerId,
          slug: resolvedSlug,
          displayName: name,
          purpose,
          metadata,
        });
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastGovPending.creatingDao,
        successMessage: txToastGovSuccess.daoCreated,
        failureMessage: txToastGovError.daoCreateFailed,
      });
      if (!confirmed) return;

      rememberOptimisticMyDao({
        daoAccountId: createdId,
        roleNames: ['council'],
      });
      rememberCommunityDao(createdId);

      if (publishSocial) {
        try {
          const socialPayload = buildDaoSocialProfileProposalPayload({
            name: name.trim(),
            bio: purpose.trim() || undefined,
            avatar,
            banner,
            links:
              Object.keys(normalizedLinks).length > 0 ? normalizedLinks : null,
          });
          const socialResponse = await submitProtocolProposal({
            daoAccountId: createdId,
            accountId: signerId,
            wallet,
            payload: socialPayload,
          });
          await trackTransaction({
            txHashes: socialResponse.txHashes,
            submittedMessage: txToastGovPending.publishingDaoProfile,
            successMessage: txToastGovSuccess.daoProfileProposed,
            failureMessage: txToastGovError.daoProfilePublishFailed,
          });
        } catch (cause) {
          if (!isWalletUserCancellation(cause)) {
            setTxResult({
              type: 'error',
              msg: txToastGovError.daoProfilePublishFailed,
            });
          }
        }
      }

      router.push(daoPath(createdId));
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      const message =
        cause instanceof Error && cause.message.trim()
          ? cause.message.trim()
          : txToastGovError.daoCreateFailed;
      setError(message);
      setTxResult({
        type: 'error',
        msg: txToastGovError.daoCreateFailed,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <OsAppScreen
      title={DAO_CREATE_TITLE}
      subtitle={daoCreateWhisper(dealNearLabel)}
      dockBack
      headerOwnsConnect
      backFallbackHref={APP_DAOS_PATH}
      onDockBack={handleDockBack}
      glassChrome
      style={screenStyle}
      footer={
        <CommerceSheetFooter
          formId={DAO_CREATE_FORM_ID}
          keyboardOpen={formKeyboardOpen}
          state={footerState}
        />
      }
    >
      <form
        id={DAO_CREATE_FORM_ID}
        className={DAO_CREATE_FORM_CLASS}
        data-form-focused={formFieldFocused ? '' : undefined}
        data-keyboard={formKeyboardOpen ? 'open' : undefined}
        onFocusCapture={handleFormFocusCapture}
        onBlurCapture={handleFormBlurCapture}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <DaoLookPreview
          coverUrl={bannerPreview}
          crestUrl={avatarPreview}
          disabled={pending || discardConfirmOpen}
          onCoverChange={onBannerChange}
          onCrestChange={(event) => {
            void onAvatarChange(event);
          }}
          onRemoveCover={clearBanner}
          onRemoveCrest={clearAvatar}
        />

        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSlugTouched(false);
              setError(null);
            }}
            placeholder="Builder Guild"
            maxLength={DAO_FACTORY_NAME_MAX}
            disabled={pending || discardConfirmOpen}
            onFocus={scrollFieldIntoView}
            className={osFieldBorderedClassName}
            autoComplete="off"
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('slug')}>
          <span>Account id</span>
          <input
            id={fieldId('slug')}
            value={slugTouched ? slug : resolvedSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
              setError(null);
            }}
            placeholder="builder-guild"
            maxLength={48}
            disabled={pending || discardConfirmOpen}
            onFocus={scrollFieldIntoView}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            aria-invalid={idAvailability === 'taken'}
            className={`${osFieldBorderedClassName}${
              idAvailabilityClass ? ` ${idAvailabilityClass}` : ''
            }`}
          />
          <small className={idAvailabilityClass}>
            {daoAccountIdLead(idAvailability)} ·{' '}
            <span className="dao-create-mono">
              {daoAccountId || `name.${SPUTNIK_DAO_FACTORY}`}
            </span>
          </small>
        </label>

        <button
          type="button"
          className="collection-allowlist-toggle"
          aria-expanded={purposeOpen}
          disabled={pending || discardConfirmOpen}
          onClick={() => setPurposeOpen((open) => !open)}
        >
          {daoCreatePurposeToggle({
            open: purposeOpen,
            hasText: purpose.trim().length > 0,
          })}
        </button>
        {purposeOpen ? (
          <label className="guild-field" htmlFor={fieldId('purpose')}>
            <span>Purpose</span>
            <textarea
              id={fieldId('purpose')}
              value={purpose}
              onChange={(event) => {
                setPurpose(event.target.value);
                setError(null);
              }}
              placeholder="Optional — what this DAO is for"
              maxLength={DAO_FACTORY_PURPOSE_MAX}
              rows={3}
              disabled={pending || discardConfirmOpen}
              onFocus={scrollFieldIntoView}
              className={osFieldBorderedClassName}
            />
          </label>
        ) : null}

        <button
          type="button"
          className="dao-create-publish"
          role="switch"
          aria-checked={publishSocial}
          disabled={pending || discardConfirmOpen}
          onClick={() => setPublishSocial((on) => !on)}
        >
          <span>{DAO_CREATE_PUBLISH}</span>
          <span
            className={`account-safe-mode-switch${publishSocial ? ' is-on' : ''}`}
            aria-hidden
          />
        </button>

        <button
          type="button"
          className="collection-allowlist-toggle"
          aria-expanded={showAdvanced}
          disabled={pending || discardConfirmOpen}
          onClick={() => setShowAdvanced((open) => !open)}
        >
          {showAdvanced ? DAO_CREATE_ADVANCED_HIDE : DAO_CREATE_ADVANCED}
        </button>

        {showAdvanced ? (
          <>
            <div className="dao-create-facts" aria-label="What you get">
              <p className="dao-create-facts-title">You get</p>
              <ul className="dao-create-facts-list">
                <li>{policyFacts.publicPropose}</li>
                <li>{policyFacts.vote}</li>
                <li>{policyFacts.bond}</li>
              </ul>
            </div>

            <div className="dao-create-links">
              <button
                type="button"
                className="dao-create-links-toggle"
                aria-expanded={linksOpen}
                disabled={pending || discardConfirmOpen}
                onClick={() => setLinksOpen((open) => !open)}
              >
                {linksOpen ? 'Hide links' : 'Add links'}
              </button>
              {linksOpen ? (
                <ProfileLinksEditor
                  links={links}
                  fieldErrors={linkErrors}
                  onUpdateLink={(key, value) => {
                    setLinks((prev) => ({ ...prev, [key]: value }));
                    setLinkErrors((prev) => {
                      if (!prev[key]) return prev;
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }}
                  onClearFieldError={(key) => {
                    setLinkErrors((prev) => {
                      if (!prev[key]) return prev;
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }}
                  onSetFieldError={(key, nextError) => {
                    setLinkErrors((prev) => {
                      if (!nextError) {
                        if (!prev[key]) return prev;
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      }
                      return { ...prev, [key]: nextError };
                    });
                  }}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {error ? (
          <p className="dao-create-error" role="alert">
            {error}
          </p>
        ) : !isConnected ? (
          <p className="profile-support-hint">{DAO_CREATE_CONNECT_HINT}</p>
        ) : nearShortfall != null ? (
          <p className="profile-support-hint">
            {daoCreateNearShortHint(yoctoToNear(String(nearShortfall)))}
          </p>
        ) : null}
      </form>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
        title="Discard DAO?"
        body="Name, account id, media, and purpose won’t be saved."
      />
    </OsAppScreen>
  );
}
