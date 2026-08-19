'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  DiscardConfirmSheet,
  OsGestureSheet,
  ProfileEditorMediaToolbar,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { rememberCommunityDao } from '@/features/protocol/dao-accounts';
import { buildDaoBrandingMetadata } from '@/features/protocol/dao-branding';
import {
  buildDaoFactoryAccountId,
  DAO_FACTORY_NAME_MAX,
  DAO_FACTORY_PURPOSE_MAX,
  DAO_FACTORY_SLUG_MIN,
  daoFactoryCreatePolicyFacts,
  isValidDaoFactorySlug,
  normalizeDaoFactorySlug,
  probeDaoFactoryAccountTaken,
  submitDaoFactoryCreate,
} from '@/features/protocol/dao-factory-create';
import { buildDaoSocialProfileProposalPayload } from '@/features/protocol/dao-social-profile';
import { rememberOptimisticMyDao } from '@/features/protocol/my-daos-optimistic';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import { PROTOCOL_TASK_SHEET_Z } from '@/features/protocol/protocol-sheet-z';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  type EntityIdAvailability,
} from '@/hooks/use-entity-id-availability';
import {
  SPUTNIK_DAO_FACTORY,
  SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT_NEAR,
  SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR,
} from '@/lib/app-config';
import { daoPath } from '@/lib/app-routes';
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
 * Factory DAO create — tall gesture sheet from the DAOs directory header.
 * Full starter policy (50/100, 0.1 Ⓝ bond) + optional branding / social publish.
 */
export function DaoCreateSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const formId = useId();
  const titleId = useId();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
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
  const [publishSocial, setPublishSocial] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const sheetOpen = open && !closing;
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);

  const resetForm = useCallback(() => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setPurpose('');
    setLinks(profileLinksInputFromRecord(null));
    setLinkErrors({});
    setLinksOpen(false);
    setPublishSocial(false);
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPending(false);
    setError(null);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const requestSheetClose = useCallback(() => {
    setClosing(true);
  }, []);

  const dirty =
    name.trim().length > 0 ||
    purpose.trim().length > 0 ||
    avatarFile != null ||
    bannerFile != null ||
    publishSocial ||
    linksOpen ||
    (slugTouched && slug.trim().length > 0) ||
    Object.values(links).some((value) => value.trim().length > 0);

  const {
    discardConfirmOpen,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({
    open: sheetOpen,
    dirty,
    pending,
    onClose: requestSheetClose,
  });

  const handleGestureClose = useCallback(() => {
    if (requestCloseOrConfirm()) {
      requestSheetClose();
    }
  }, [requestCloseOrConfirm, requestSheetClose]);

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

  const canSubmit =
    isValidDaoFactorySlug(resolvedSlug) &&
    name.trim().length >= 2 &&
    !pending &&
    idAvailability !== 'taken' &&
    idAvailability !== 'checking' &&
    Object.keys(profileLinkEditorFieldErrors(links)).length === 0;

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!sheetOpen) return null;
    if (!isConnected) {
      return {
        visible: true,
        primaryLabel: 'Connect wallet',
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
      primaryLabel: 'Create DAO',
      primaryPendingLabel: 'Confirm in wallet…',
      canSubmit,
      pending,
      disabled: pending || !canSubmit,
      primaryType: 'submit',
    };
  }, [sheetOpen, isConnected, connect, canSubmit, pending]);

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
      setError('Fix the link fields before creating.');
      return;
    }

    if (!canSubmit) {
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

      requestSheetClose();
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
    <>
      <OsGestureSheet
        open={sheetOpen}
        onClose={handleGestureClose}
        onClosed={() => {
          clearDiscardConfirm();
          handleClosed();
        }}
        verb="Create DAO"
        handle={SPUTNIK_DAO_FACTORY}
        signal="reputation"
        whisper={`You start as council · ~${SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT_NEAR} NEAR`}
        closeAriaLabel="Close create DAO"
        backdropLabel="Close create DAO"
        keyboardOpen={keyboardOpen}
        panelStyle={panelStyle}
        bodyClassName="profile-support-sheet-body protocol-task-sheet-body"
        titleId={titleId}
        zIndex={PROTOCOL_TASK_SHEET_Z}
        footer={
          footerState?.visible ? (
            <CommerceSheetFooter
              formId={formId}
              keyboardOpen={keyboardOpen}
              state={footerState}
            />
          ) : undefined
        }
      >
        <form
          id={formId}
          className="protocol-task-form dao-create-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <p className="dao-create-lede">
            Deploys under the network factory. Account id is permanent — pick
            carefully.
          </p>

          <section className="dao-create-hero" aria-label="DAO media">
            <div
              className={`account-editor-cover-stage dao-create-cover${bannerPreview ? ' has-media' : ''}`}
            >
              <div className="account-editor-banner-wrap">
                <div
                  className={`account-editor-banner-button profile-editor-media-host${bannerPreview ? ' has-media' : ''}`}
                >
                  <button
                    type="button"
                    className="profile-editor-media-backdrop account-editor-banner-backdrop"
                    disabled={pending || discardConfirmOpen}
                    onClick={() => bannerInputRef.current?.click()}
                    aria-label={bannerPreview ? 'Change cover' : 'Add cover'}
                  >
                    {bannerPreview ? (
                      <img
                        src={bannerPreview}
                        alt=""
                        className="account-editor-banner-image"
                      />
                    ) : (
                      <span className="dao-create-media-empty">Cover</span>
                    )}
                  </button>
                  <ProfileEditorMediaToolbar
                    layout="banner"
                    removeLabel={bannerPreview ? 'Remove cover' : undefined}
                    onRemove={bannerPreview ? clearBanner : undefined}
                  />
                </div>
              </div>
              <div className="dao-create-crest-row">
                <button
                  type="button"
                  className={`dao-create-crest-picker profile-editor-media-host profile-editor-media-host--squircle${avatarPreview ? ' has-media' : ''}`}
                  disabled={pending || discardConfirmOpen}
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label={avatarPreview ? 'Change crest' : 'Add crest'}
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt=""
                      className="dao-create-crest-image"
                    />
                  ) : (
                    <span className="dao-create-media-empty">Crest</span>
                  )}
                </button>
                {avatarPreview ? (
                  <ProfileEditorMediaToolbar
                    layout="avatar"
                    removeLabel="Remove crest"
                    onRemove={clearAvatar}
                  />
                ) : null}
              </div>
            </div>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="account-editor-file-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending || discardConfirmOpen}
              onChange={onBannerChange}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="account-editor-file-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending || discardConfirmOpen}
              onChange={(event) => {
                void onAvatarChange(event);
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
                setSlugTouched(false);
                setError(null);
              }}
              placeholder="Builder Guild"
              maxLength={DAO_FACTORY_NAME_MAX}
              disabled={pending || discardConfirmOpen}
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
              className={osFieldBorderedClassName}
            />
          </label>

          <div className="dao-create-facts" aria-label="What you get">
            <p className="dao-create-facts-title">You get</p>
            <ul className="dao-create-facts-list">
              <li>{policyFacts.council}</li>
              <li>{policyFacts.publicPropose}</li>
              <li>{policyFacts.vote}</li>
              <li>{policyFacts.bond}</li>
              <li>{policyFacts.createDeposit}</li>
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

          <label className="dao-create-toggle">
            <input
              type="checkbox"
              checked={publishSocial}
              disabled={pending || discardConfirmOpen}
              onChange={(event) => setPublishSocial(event.target.checked)}
            />
            <span>
              Also publish OnSocial profile
              <small>
                After create, proposes a Call so feeds see the same crest and
                name. Approve on the DAO (~
                {SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR} NEAR bond).
              </small>
            </span>
          </label>

          {error ? (
            <p className="dao-create-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </OsGestureSheet>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
        title="Discard DAO?"
        body="Name, account id, media, and purpose won’t be saved."
      />
    </>
  );
}
