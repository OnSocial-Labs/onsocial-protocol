'use client';

/**
 * DAO profile editor — cover + square crest.
 * - `config` (default): ChangeConfig metadata (`onsocial` blob) for the face.
 * - `social`: Call proposal that writes OnSocial `{dao}/profile/*` only.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  DiscardConfirmSheet,
  OsField,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { DaoPageSlideOverScreen } from '@/features/protocol/dao-page-slide-over-screen';
import { DaoLookPreview } from '@/features/protocol/dao-look-preview';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  buildDaoBrandingMetadata,
  resolveDaoEditBaseline,
  type DaoBranding,
} from '@/features/protocol/dao-branding';
import { buildDaoSocialProfileProposalPayload } from '@/features/protocol/dao-social-profile';
import { buildProtocolPolicyConfigPayload } from '@/features/protocol/protocol-policy';
import {
  submitProtocolProposal,
  submitProtocolProposals,
} from '@/features/protocol/protocol-create';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import {
  DAO_CREATE_PUBLISH,
  DAO_EDIT_PUBLISH_HINT,
} from '@/features/protocol/dao-create-voice';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useDaoPageCapability } from '@/hooks/use-dao-page-capability';
import { bumpDaoWorkspacePrefetch } from '@/lib/dao-workspace-prefetch';
import { prepareSquareOpaqueJpeg } from '@/lib/prepare-square-opaque-jpeg';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import {
  PROFILE_LINK_EDITOR_FIELDS,
  normalizeProfileLinksInput,
  profileLinkEditorFieldErrors,
  profileLinksInputFromRecord,
  type ProfileLinksInput,
} from '@/lib/profile-links';
import {
  FACE_BIO_LIMIT_WARN,
  FACE_BIO_WRAP_CHARS,
  PROFILE_BIO_LIMIT_WARN,
  PROFILE_BIO_MAX,
  clampFaceEditorInput,
  partitionDaoPurposeFaceAbout,
} from '@/lib/profile-bio-face';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const MAX_NAME = 64;

export type DaoEditSheetMode = 'config' | 'social';

interface DaoEditSheetProps {
  open: boolean;
  daoAccountId: string;
  branding: DaoBranding;
  /** `config` = ChangeConfig (face). `social` = Call to OnSocial profile only. */
  mode?: DaoEditSheetMode;
  configName: string;
  configPurpose: string;
  configMetadata: string;
  onClose: () => void;
  /** After proposal tx confirms — open that proposal (face stays until approval). */
  onProposed?: (proposalId: number | null) => void;
}

export function DaoEditSheet({
  open,
  daoAccountId,
  branding,
  mode = 'config',
  configName,
  configPurpose,
  configMetadata,
  onClose,
  onProposed,
}: DaoEditSheetProps) {
  const isSocial = mode === 'social';
  const formId = useId();
  const { getSigningWallet } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const { eligibility, isLoading: eligibilityLoading } = useDaoPageCapability(
    daoAccountId,
    true
  );

  const baseline = useMemo(
    () =>
      resolveDaoEditBaseline({
        mode,
        branding,
        configName,
        configPurpose,
        configMetadata,
      }),
    [mode, branding, configName, configPurpose, configMetadata]
  );

  const [name, setName] = useState(baseline.name);
  const [purpose, setPurpose] = useState(baseline.purpose);
  const [face, setFace] = useState(baseline.face);
  const [about, setAbout] = useState(baseline.about);
  const [publishSocial, setPublishSocial] = useState(false);
  const [links, setLinks] = useState<ProfileLinksInput>(() =>
    profileLinksInputFromRecord(baseline.links)
  );
  const [linkErrors, setLinkErrors] = useState<
    Partial<Record<keyof ProfileLinksInput, string>>
  >({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposeConfirmOpen, setProposeConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(baseline.name);
    setPurpose(baseline.purpose);
    setFace(baseline.face);
    setAbout(baseline.about);
    setPublishSocial(false);
    setLinks(profileLinksInputFromRecord(baseline.links));
    setLinkErrors({});
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreview(null);
    setBannerPreview(null);
    setAvatarRemoved(false);
    setBannerRemoved(false);
    setError(null);
    setProposeConfirmOpen(false);
  }, [open, baseline]);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    },
    [avatarPreview, bannerPreview]
  );

  const baselineLinks = useMemo(
    () => profileLinksInputFromRecord(baseline.links),
    [baseline.links]
  );

  const isDirty = useMemo(() => {
    const baselineName = baseline.name.trim();
    const baselinePurpose = baseline.purpose.trim();
    // Compare editor field text only — never throw from link normalizers here.
    const linksDirty = PROFILE_LINK_EDITOR_FIELDS.some(
      (field) => links[field.key].trim() !== baselineLinks[field.key].trim()
    );
    const onSocialDirty = isSocial
      ? face.trim() !== baseline.face.trim() ||
        about.trim() !== baseline.about.trim()
      : publishSocial;
    return (
      name.trim() !== baselineName ||
      purpose.trim() !== baselinePurpose ||
      onSocialDirty ||
      linksDirty ||
      avatarFile !== null ||
      bannerFile !== null ||
      avatarRemoved ||
      bannerRemoved
    );
  }, [
    about,
    avatarFile,
    avatarRemoved,
    bannerFile,
    bannerRemoved,
    baseline.about,
    baseline.face,
    baseline.purpose,
    baseline.name,
    baselineLinks,
    face,
    isSocial,
    links,
    name,
    publishSocial,
    purpose,
  ]);

  const hasInvalidLinks = useMemo(
    () => Object.keys(profileLinkEditorFieldErrors(links)).length > 0,
    [links]
  );

  const hasProposeRight = isSocial
    ? Boolean(eligibility?.canProposeCall)
    : Boolean(eligibility?.canChangeConfig);
  const canBatchSocial = !isSocial && Boolean(eligibility?.canProposeCall);
  const batchSocial = canBatchSocial && publishSocial;
  const bondCount = batchSocial ? 2 : 1;

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
    avatarPreview ?? (avatarRemoved ? null : baseline.avatarUrl);
  const bannerSrc =
    bannerPreview ?? (bannerRemoved ? null : baseline.bannerUrl);
  const deniedDetail = isSocial
    ? 'Needs call permission on this DAO.'
    : 'Needs config permission on this DAO.';

  const canSave =
    name.trim().length >= 2 &&
    isDirty &&
    !pending &&
    !hasInvalidLinks &&
    hasProposeRight;

  const requestProposeConfirm = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    if (!hasProposeRight) {
      setError(deniedDetail);
      return;
    }
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
    if (!hasProposeRight) {
      setError(deniedDetail);
      setProposeConfirmOpen(false);
      return;
    }
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
      let avatar = baseline.avatar;
      let banner = baseline.banner;
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
      const { accountId: signerId, wallet } = await getSigningWallet();

      if (isSocial) {
        const socialPayload = buildDaoSocialProfileProposalPayload({
          name: name.trim(),
          bio: face.trim() || undefined,
          about: about.trim() || null,
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
        const confirmed = await trackTransaction({
          txHashes: socialResponse.txHashes,
          submittedMessage: txToastGovPending.publishingDaoProfile,
          successMessage: txToastGovSuccess.daoProfileProposed,
          failureMessage: txToastGovError.daoProfilePublishFailed,
        });
        if (!confirmed) return;
        bumpDaoWorkspacePrefetch(daoAccountId);
        setProposeConfirmOpen(false);
        onProposed?.(socialResponse.proposalId);
        return;
      }

      const onChainName = name.trim() || configName.trim() || daoAccountId;
      const onChainPurpose = purpose.trim() || onChainName;
      const metadata = buildDaoBrandingMetadata(configMetadata, {
        name: name.trim(),
        description: purpose.trim() || null,
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

      if (batchSocial) {
        const socialPayload = buildDaoSocialProfileProposalPayload({
          name: name.trim(),
          bio: face.trim() || undefined,
          about: about.trim() || null,
          avatar,
          banner,
          links:
            Object.keys(normalizedLinks).length > 0 ? normalizedLinks : null,
        });
        const batched = await submitProtocolProposals({
          daoAccountId,
          accountId: signerId,
          wallet,
          payloads: [payload, socialPayload],
        });
        const confirmed = await trackTransaction({
          txHashes: batched.txHashes,
          submittedMessage:
            txToastGovPending.actionSubmitted('Profile proposals'),
          successMessage: txToastGovSuccess.daoChangeConfigProposed,
          failureMessage: txToastGovError.actionFailed('Profile proposals'),
        });
        if (!confirmed) return;
        bumpDaoWorkspacePrefetch(daoAccountId);
        setProposeConfirmOpen(false);
        onProposed?.(
          [...batched.proposalIds]
            .reverse()
            .find((id): id is number => id != null) ?? null
        );
        return;
      }

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

      bumpDaoWorkspacePrefetch(daoAccountId);
      setProposeConfirmOpen(false);
      onProposed?.(response.proposalId);
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : isSocial
              ? txToastGovError.daoProfilePublishFailed
              : txToastGovError.actionFailed('DAO profile'),
      });
    } finally {
      setPending(false);
    }
  };

  const faceAboutFields = (
    <>
      <OsField
        label="Face"
        htmlFor={`${formId}-face`}
        hint={
          face.length >= FACE_BIO_LIMIT_WARN
            ? `${face.length}/${FACE_BIO_WRAP_CHARS}`
            : undefined
        }
      >
        <textarea
          id={`${formId}-face`}
          rows={3}
          value={face}
          maxLength={FACE_BIO_WRAP_CHARS}
          disabled={pending}
          placeholder="Short line on the OnSocial page…"
          onChange={(event) =>
            setFace(clampFaceEditorInput(event.target.value))
          }
          className={osFieldBorderedClassName}
        />
      </OsField>
      <OsField
        label="About"
        htmlFor={`${formId}-about`}
        hint={
          about.length >= PROFILE_BIO_LIMIT_WARN
            ? `${about.length}/${PROFILE_BIO_MAX}`
            : undefined
        }
      >
        <textarea
          id={`${formId}-about`}
          rows={4}
          value={about}
          maxLength={PROFILE_BIO_MAX}
          disabled={pending}
          placeholder="Continuation after the face…"
          onChange={(event) =>
            setAbout(event.target.value.slice(0, PROFILE_BIO_MAX))
          }
          className={osFieldBorderedClassName}
        />
      </OsField>
    </>
  );

  return (
    <>
      <DaoPageSlideOverScreen
        pageAccountId={daoAccountId}
        open={open}
        onClose={onClose}
        onBeforeClose={handleBeforeClose}
        onClosed={clearDiscardConfirm}
        title={isSocial ? 'Publish OnSocial profile' : 'Edit DAO profile'}
        subtitle={
          isSocial
            ? 'Call proposal to OnSocial profile keys.'
            : 'Publishes as a config proposal.'
        }
        closeAriaLabel={
          isSocial ? 'Back from publish OnSocial' : 'Back from edit DAO'
        }
        closeDisabled={pending}
        zIndex={SHEET_Z.overShell}
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
                {isSocial ? 'Propose OnSocial' : 'Propose profile'}
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
            <DaoLookPreview
              coverUrl={bannerSrc}
              crestUrl={avatarSrc}
              disabled={pending}
              onCoverChange={onBannerChange}
              onCrestChange={(event) => void onAvatarChange(event)}
              onRemoveCover={bannerSrc ? clearBanner : undefined}
              onRemoveCrest={avatarSrc ? clearAvatar : undefined}
            />
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

          {!isSocial ? (
            <OsField
              label="Purpose"
              htmlFor={`${formId}-purpose`}
              hint={
                purpose.length >= PROFILE_BIO_LIMIT_WARN
                  ? `${purpose.length}/${PROFILE_BIO_MAX}`
                  : undefined
              }
            >
              <textarea
                id={`${formId}-purpose`}
                rows={4}
                value={purpose}
                maxLength={PROFILE_BIO_MAX}
                disabled={pending}
                placeholder="What this DAO stewards…"
                onChange={(event) =>
                  setPurpose(event.target.value.slice(0, PROFILE_BIO_MAX))
                }
                className={osFieldBorderedClassName}
              />
            </OsField>
          ) : null}

          {isSocial ? faceAboutFields : null}

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

          {canBatchSocial ? (
            <button
              type="button"
              className="account-action-toggle dao-edit-publish"
              role="switch"
              aria-checked={publishSocial}
              disabled={pending}
              onClick={() => {
                if (!publishSocial) {
                  const split = partitionDaoPurposeFaceAbout(purpose);
                  setFace(split.face);
                  setAbout(split.about);
                }
                setPublishSocial((on) => !on);
              }}
            >
              <span className="account-action-toggle-copy">
                <span className="account-action-toggle-label">
                  {DAO_CREATE_PUBLISH}
                </span>
                <span className="account-action-toggle-hint">
                  {DAO_EDIT_PUBLISH_HINT}
                </span>
              </span>
              <span
                className={`account-safe-mode-switch${publishSocial ? ' is-on' : ''}`}
                aria-hidden
              />
            </button>
          ) : null}

          {!isSocial && publishSocial ? faceAboutFields : null}

          {error ? <p className="guild-form-error">{error}</p> : null}
        </form>
      </DaoPageSlideOverScreen>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
      />
      <DaoProposeConfirmSheet
        open={proposeConfirmOpen}
        title={isSocial ? 'Propose OnSocial profile?' : 'Propose profile?'}
        body={
          isSocial
            ? 'Submit a Call proposal that writes cover, crest, name, Face, and About to OnSocial. Live after council approval.'
            : batchSocial
              ? 'Submit config and OnSocial together. Live after council approval.'
              : 'Submit a config proposal for cover, crest, name, and purpose. Live after council approval.'
        }
        eligibility={eligibility}
        eligibilityLoading={eligibilityLoading}
        canPropose={hasProposeRight}
        allowStakeUnlock={false}
        bondCount={bondCount}
        deniedDetail={deniedDetail}
        pending={pending}
        proposeLabel="Propose"
        zIndex={SHEET_Z.confirm}
        onDiscard={() => setProposeConfirmOpen(false)}
        onPropose={() => {
          void save();
        }}
      />
    </>
  );
}
