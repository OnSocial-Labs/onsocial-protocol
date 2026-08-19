'use client';

/**
 * DAO profile editor — cover + square crest.
 * Publishes via ChangeConfig metadata (`onsocial` blob) so any Sputnik DAO
 * can brand without writing under the DAO's OnSocial profile keys directly.
 */

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
import {
  DiscardConfirmSheet,
  OsField,
  OsFieldRemove,
  OsSheetAction,
  OsSheetActions,
  ProfileEditorMediaToolbar,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  buildDaoBrandingMetadata,
  type DaoBranding,
} from '@/features/protocol/dao-branding';
import { buildDaoSocialProfileProposalPayload } from '@/features/protocol/dao-social-profile';
import { buildProtocolPolicyConfigPayload } from '@/features/protocol/protocol-policy';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useDaoPageCapability } from '@/hooks/use-dao-page-capability';
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
import { SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR } from '@/lib/app-config';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';

const DAO_EDIT_Z = 90;
const DAO_EDIT_CONFIRM_Z = 110;
const MAX_NAME = 64;
const MAX_DESCRIPTION = 280;
const BANNER_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

interface DaoEditSheetProps {
  open: boolean;
  daoAccountId: string;
  branding: DaoBranding;
  configName: string;
  configPurpose: string;
  configMetadata: string;
  onClose: () => void;
  /** After ChangeConfig proposal tx confirms — face stays as-is until approval. */
  onProposed?: () => void;
}

export function DaoEditSheet({
  open,
  daoAccountId,
  branding,
  configName,
  configPurpose,
  configMetadata,
  onClose,
  onProposed,
}: DaoEditSheetProps) {
  const formId = useId();
  const { getSigningWallet } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const { eligibility, isLoading: eligibilityLoading } = useDaoPageCapability(
    daoAccountId,
    true
  );
  const moodPreview = usePortfolioMoodPreviewOptional();

  const [name, setName] = useState(branding.name);
  const [description, setDescription] = useState(branding.description ?? '');
  const [links, setLinks] = useState<ProfileLinksInput>(() =>
    profileLinksInputFromRecord(branding.links)
  );
  const [linkErrors, setLinkErrors] = useState<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const [publishSocial, setPublishSocial] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposeConfirmOpen, setProposeConfirmOpen] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(branding.name);
    setDescription(branding.description ?? '');
    setLinks(profileLinksInputFromRecord(branding.links));
    setLinkErrors({});
    setPublishSocial(false);
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreview(null);
    setBannerPreview(null);
    setAvatarRemoved(false);
    setBannerRemoved(false);
    setError(null);
    setProposeConfirmOpen(false);
  }, [open, branding]);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    },
    [avatarPreview, bannerPreview]
  );

  const baselineLinks = useMemo(
    () =>
      normalizeProfileLinksInput(
        profileLinksInputFromRecord(branding.links),
        undefined
      ),
    [branding.links]
  );

  const isDirty = useMemo(() => {
    const baselineName = branding.name.trim();
    const baselineDescription = (branding.description ?? '').trim();
    const nextLinks = normalizeProfileLinksInput(links, undefined);
    const linksDirty =
      JSON.stringify(nextLinks) !== JSON.stringify(baselineLinks);
    return (
      name.trim() !== baselineName ||
      description.trim() !== baselineDescription ||
      linksDirty ||
      publishSocial ||
      avatarFile !== null ||
      bannerFile !== null ||
      avatarRemoved ||
      bannerRemoved
    );
  }, [
    avatarFile,
    avatarRemoved,
    bannerFile,
    bannerRemoved,
    baselineLinks,
    branding.description,
    branding.name,
    description,
    links,
    name,
    publishSocial,
  ]);

  const {
    discardConfirmOpen,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({
    open,
    dirty: isDirty,
    pending,
    onClose,
  });

  const handleBeforeClose = useCallback(() => {
    if (discardConfirmOpen) {
      keepEditing();
      return false;
    }
    return requestCloseOrConfirm();
  }, [discardConfirmOpen, keepEditing, requestCloseOrConfirm]);

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
      setAvatarRemoved(false);
      setAvatarFile(prepared);
      setAvatarPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(prepared);
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not prepare crest.'
      );
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
    setBannerRemoved(false);
    setBannerFile(file);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarRemoved(true);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const clearBanner = () => {
    setBannerFile(null);
    setBannerRemoved(true);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const avatarSrc =
    avatarPreview ?? (avatarRemoved ? null : branding.avatarUrl);
  const bannerSrc =
    bannerPreview ?? (bannerRemoved ? null : branding.bannerUrl);
  const canSave = name.trim().length >= 2 && isDirty && !pending;

  const requestProposeConfirm = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    const nextLinkErrors = profileLinkEditorFieldErrors(links);
    if (Object.keys(nextLinkErrors).length > 0) {
      setLinkErrors(nextLinkErrors);
      setError('Fix the link fields before proposing.');
      return;
    }
    setError(null);
    setProposeConfirmOpen(true);
  };

  const save = async () => {
    if (!canSave) return;
    const nextLinkErrors = profileLinkEditorFieldErrors(links);
    if (Object.keys(nextLinkErrors).length > 0) {
      setLinkErrors(nextLinkErrors);
      setError('Fix the link fields before proposing.');
      setProposeConfirmOpen(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { client } = await getClient();
      let avatar = branding.avatar;
      let banner = branding.banner;
      if (avatarFile) {
        const uploaded = await client.storage.upload(avatarFile);
        avatar = `ipfs://${uploaded.cid}`;
      } else if (avatarRemoved) {
        avatar = null;
      }
      if (bannerFile) {
        const uploaded = await client.storage.upload(bannerFile);
        banner = `ipfs://${uploaded.cid}`;
      } else if (bannerRemoved) {
        banner = null;
      }

      const normalizedLinks = normalizeProfileLinksInput(links, undefined);
      const onChainName = (configName || name).trim() || name.trim();
      const onChainPurpose =
        (configPurpose || description).trim() ||
        description.trim() ||
        name.trim();
      const metadata = buildDaoBrandingMetadata(configMetadata, {
        name: name.trim(),
        description: description.trim() || null,
        avatar,
        banner,
        links: Object.keys(normalizedLinks).length > 0 ? normalizedLinks : null,
      });
      const payload = buildProtocolPolicyConfigPayload({
        name: onChainName,
        purpose: onChainPurpose,
        metadata,
        description: `Update DAO profile for ${name.trim()}.`,
      });
      const { accountId: signerId, wallet } = await getSigningWallet();
      const response = await submitProtocolProposal({
        daoAccountId,
        accountId: signerId,
        wallet,
        payload,
      });
      const confirmed = await trackTransaction({
        txHashes: response.txHashes,
        submittedMessage: txToastGovPending.actionSubmitted('Change proposal'),
        successMessage: txToastGovSuccess.daoChangeConfigProposed,
        failureMessage: txToastGovError.actionFailed('Change proposal'),
      });
      if (!confirmed) return;

      if (publishSocial) {
        try {
          const socialPayload = buildDaoSocialProfileProposalPayload({
            name: name.trim(),
            bio: description.trim() || undefined,
            avatar,
            banner,
            links:
              Object.keys(normalizedLinks).length > 0 ? normalizedLinks : null,
          });
          const socialResponse = await submitProtocolProposal({
            daoAccountId,
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

      setProposeConfirmOpen(false);
      onProposed?.();
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastGovError.actionFailed('DAO profile'),
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <OsSlideOverScreen
        open={open}
        onClose={onClose}
        onBeforeClose={handleBeforeClose}
        onClosed={clearDiscardConfirm}
        title="Edit DAO profile"
        subtitle="Cover + square crest — publishes as a config proposal."
        closeAriaLabel="Back from edit DAO"
        closeDisabled={pending}
        zIndex={DAO_EDIT_Z}
        className="hub-manage-slide"
        contentClassName="hub-manage-slide-body"
        footer={
          <div className="hub-manage-sheet-footer">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="submit"
                form={formId}
                ready={canSave}
                pending={pending}
                pendingLabel="Proposing…"
                disabled={!canSave}
              >
                Propose profile
              </OsSheetAction>
            </OsSheetActions>
          </div>
        }
      >
        <form
          id={formId}
          className="hub-manage-form"
          onSubmit={(e) => requestProposeConfirm(e)}
        >
          <section className="dao-edit-hero" aria-label="DAO media">
            <div
              className={`account-editor-cover-stage dao-edit-cover${bannerSrc ? ' has-media' : ''}`}
            >
              <div className="account-editor-banner-wrap">
                <div
                  className={`account-editor-banner-button profile-editor-media-host${bannerSrc ? ' has-media' : ''}`}
                >
                  <button
                    type="button"
                    className="profile-editor-media-backdrop account-editor-banner-backdrop"
                    disabled={pending}
                    onClick={() => bannerInputRef.current?.click()}
                    aria-label={bannerSrc ? 'Change cover' : 'Add cover'}
                  >
                    {bannerSrc ? (
                      <img
                        src={bannerSrc}
                        alt=""
                        className="account-editor-banner-image"
                      />
                    ) : (
                      <span
                        className="account-editor-banner-empty"
                        aria-hidden
                      />
                    )}
                    <span
                      className={`account-editor-banner-overlay${bannerSrc ? ' has-media' : ''}`}
                      aria-hidden
                    />
                  </button>
                  <ProfileEditorMediaToolbar
                    layout="banner"
                    removeLabel={bannerSrc ? 'Remove cover' : undefined}
                    onRemove={bannerSrc ? clearBanner : undefined}
                  />
                </div>
              </div>
            </div>

            <div className="dao-edit-crest-row">
              <button
                type="button"
                className={`dao-edit-crest-picker profile-editor-media-host profile-editor-media-host--squircle${avatarSrc ? ' has-media' : ''}`}
                disabled={pending}
                onClick={() => avatarInputRef.current?.click()}
                aria-label={avatarSrc ? 'Change crest' : 'Add crest'}
              >
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" />
                ) : (
                  <span aria-hidden>+</span>
                )}
              </button>
              {avatarSrc ? (
                <OsFieldRemove
                  aria-label="Remove crest"
                  disabled={pending}
                  onClick={clearAvatar}
                />
              ) : null}
              <p className="dao-edit-crest-hint">
                Square crest · rounded corners mark this as a DAO
              </p>
            </div>
          </section>

          <OsField
            label="Name"
            htmlFor={`${formId}-name`}
            hint={`${name.length}/${MAX_NAME}`}
          >
            <input
              id={`${formId}-name`}
              value={name}
              maxLength={MAX_NAME}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              className={osFieldBorderedClassName}
            />
          </OsField>

          <OsField
            label="About"
            htmlFor={`${formId}-about`}
            hint={`${description.length}/${MAX_DESCRIPTION}`}
          >
            <textarea
              id={`${formId}-about`}
              rows={3}
              value={description}
              maxLength={MAX_DESCRIPTION}
              disabled={pending}
              placeholder="What this DAO stewards…"
              onChange={(event) => setDescription(event.target.value)}
              className={osFieldBorderedClassName}
            />
          </OsField>

          <div className="dao-edit-links">
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
          </div>

          <label className="dao-create-toggle dao-edit-social-toggle">
            <input
              type="checkbox"
              checked={publishSocial}
              disabled={pending}
              onChange={(event) => setPublishSocial(event.target.checked)}
            />
            <span>
              Also publish OnSocial profile
              <small>
                Submits a second proposal (Call) so feeds can use the same crest
                and name. ~{SPUTNIK_DAO_FACTORY_PROPOSAL_BOND_NEAR} NEAR bond —
                approve on the DAO after.
              </small>
            </span>
          </label>

          {error ? <p className="guild-form-error">{error}</p> : null}
          <p className="dao-edit-footnote">
            Saves as a DAO config proposal. Profile goes live after approval.
          </p>

          <input
            ref={avatarInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="account-editor-file-input"
            tabIndex={-1}
            aria-hidden
            disabled={pending}
            onChange={(event) => void onAvatarChange(event)}
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept={BANNER_ACCEPT}
            className="account-editor-file-input"
            tabIndex={-1}
            aria-hidden
            disabled={pending}
            onChange={onBannerChange}
          />
        </form>
      </OsSlideOverScreen>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
      />
      <DaoProposeConfirmSheet
        open={proposeConfirmOpen}
        title="Propose profile?"
        body={
          publishSocial
            ? 'Submit a config proposal for cover, crest, name, and about — plus a second Call for the OnSocial profile.'
            : 'Submit a config proposal for cover, crest, name, and about. Live after council approval.'
        }
        eligibility={eligibility}
        eligibilityLoading={eligibilityLoading}
        pending={pending}
        proposeLabel="Propose"
        zIndex={DAO_EDIT_CONFIRM_Z}
        onDiscard={() => setProposeConfirmOpen(false)}
        onPropose={() => {
          void save();
        }}
        onStake={() => {
          setProposeConfirmOpen(false);
          moodPreview?.requestDaoStake();
        }}
      />
    </>
  );
}
