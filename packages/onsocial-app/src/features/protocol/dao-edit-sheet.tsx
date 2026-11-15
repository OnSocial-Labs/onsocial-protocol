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
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  formatProfileMediaRef,
  normalizeProfileAboutAlign,
  normalizeProfileLeadInput,
  profileAvatarShapeForFace,
  type ProfileAboutAlign,
} from '@onsocial/sdk';
import {
  ChevronLeftIcon,
  DiscardConfirmSheet,
  ipfsImgSrcSet,
  OsField,
  OsIconAction,
  OsPageSheet,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { OsPageBodyAppear } from '@/components/app/os-page-body-appear';
import { PortfolioFaceEditorHero } from '@/components/wallet/portfolio-face-editor-hero';
import { ProfileLinksEditor } from '@/components/wallet/profile-links-editor';
import { ProfileAboutEditorSheet } from '@/components/wallet/profile-about-editor-sheet';
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
  DAO_CREATE_ADD_COVER,
  DAO_CREATE_ADD_CREST,
  DAO_CREATE_CHANGE_COVER,
  DAO_CREATE_PUBLISH,
  DAO_CREATE_REMOVE_COVER,
  DAO_CREATE_REMOVE_CREST,
  DAO_EDIT_PUBLISH_HINT,
} from '@/features/protocol/dao-create-voice';
import { useDaoPageMood } from '@/features/protocol/use-dao-page-mood';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { usePageKeyboardLift } from '@/hooks/use-page-keyboard-lift';
import { useDaoPageCapability } from '@/hooks/use-dao-page-capability';
import { bumpDaoWorkspacePrefetch } from '@/lib/dao-workspace-prefetch';
import {
  EDITOR_MARK_WIDTHS,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';
import {
  isMediaFramePanCentered,
  MEDIA_FRAME_PAN_CENTER,
  type MediaFramePan,
} from '@/lib/media-frame-pan';
import {
  prepareProfileAboutPhotosForSave,
  prepareProfileAvatarForSave,
  prepareProfileBannerForSave,
} from '@/lib/prepare-profile-editor-media';
import { prepareSquareOpaqueJpeg } from '@/lib/prepare-square-opaque-jpeg';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import type { ProfileAboutPhotoDraft } from '@/lib/profile-about-photos';
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
  clampProfileBioFace,
  profileAboutHasMoreThanFace,
} from '@/lib/profile-bio-face';
import {
  parseProfileAboutPhotoRefs,
  profileAboutPhotoRefsEqual,
} from '@/lib/profile-about-photos';
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
  const titleId = useId();
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const crestInputRef = useRef<HTMLInputElement>(null);
  const { getSigningWallet } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const scrollFieldIntoView = useMobileFieldFocusScroll();
  const { moodId, moodStyle } = useDaoPageMood(daoAccountId, open);
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
  const [lead, setLead] = useState(baseline.lead);
  const [aboutAlign, setAboutAlign] = useState<ProfileAboutAlign>(
    baseline.aboutAlign
  );
  const [photos, setPhotos] = useState<ProfileAboutPhotoDraft[]>(
    () => baseline.photos
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const { keyboardOpen, panelStyle } = usePageKeyboardLift(open && !aboutOpen);
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
  const [crestPan, setCrestPan] =
    useState<MediaFramePan>(MEDIA_FRAME_PAN_CENTER);
  const [coverPan, setCoverPan] =
    useState<MediaFramePan>(MEDIA_FRAME_PAN_CENTER);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposeConfirmOpen, setProposeConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(baseline.name);
    setPurpose(baseline.purpose);
    setFace(baseline.face);
    setAbout(baseline.about);
    setLead(baseline.lead);
    setAboutAlign(baseline.aboutAlign);
    setPhotos(baseline.photos.map((photo) => ({ ...photo })));
    setAboutOpen(false);
    setPublishSocial(false);
    setLinks(profileLinksInputFromRecord(baseline.links));
    setLinkErrors({});
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreview(null);
    setBannerPreview(null);
    setAvatarRemoved(false);
    setBannerRemoved(false);
    setCrestPan(MEDIA_FRAME_PAN_CENTER);
    setCoverPan(MEDIA_FRAME_PAN_CENTER);
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
        about.trim() !== baseline.about.trim() ||
        normalizeProfileLeadInput(lead) !==
          normalizeProfileLeadInput(baseline.lead) ||
        aboutAlign !== baseline.aboutAlign ||
        photos.some(
          (photo) =>
            Boolean(photo.file) || !isMediaFramePanCentered(photo.pan)
        ) ||
        !profileAboutPhotoRefsEqual(
          photos.map((photo) => photo.ref.trim()).filter(Boolean),
          baseline.photos.map((photo) => photo.ref)
        )
      : publishSocial;
    return (
      name.trim() !== baselineName ||
      purpose.trim() !== baselinePurpose ||
      onSocialDirty ||
      linksDirty ||
      avatarFile !== null ||
      bannerFile !== null ||
      avatarRemoved ||
      bannerRemoved ||
      !isMediaFramePanCentered(crestPan) ||
      !isMediaFramePanCentered(coverPan)
    );
  }, [
    about,
    aboutAlign,
    avatarFile,
    avatarRemoved,
    bannerFile,
    bannerRemoved,
    coverPan,
    crestPan,
    baseline.about,
    baseline.aboutAlign,
    baseline.face,
    baseline.lead,
    baseline.photos,
    baseline.purpose,
    baseline.name,
    baselineLinks,
    face,
    isSocial,
    lead,
    links,
    name,
    photos,
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

  const requestClose = useCallback(() => {
    if (!requestCloseOrConfirm()) return;
    onClose();
  }, [onClose, requestCloseOrConfirm]);

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
      setCrestPan(MEDIA_FRAME_PAN_CENTER);
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
    setCoverPan(MEDIA_FRAME_PAN_CENTER);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearAvatar = () => {
    setAvatarFile(null);
    setAvatarRemoved(true);
    setCrestPan(MEDIA_FRAME_PAN_CENTER);
    setAvatarPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const clearBanner = () => {
    setBannerFile(null);
    setBannerRemoved(true);
    setCoverPan(MEDIA_FRAME_PAN_CENTER);
    setBannerPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const avatarSrc =
    avatarPreview ?? (avatarRemoved ? null : baseline.avatarUrl);
  const bannerSrc =
    bannerPreview ?? (bannerRemoved ? null : baseline.bannerUrl);
  const bannerSrcSet = ipfsImgSrcSet(bannerSrc, SCARCE_HERO_WIDTHS);
  const crestSrcSet = ipfsImgSrcSet(avatarSrc, EDITOR_MARK_WIDTHS);
  const openBannerPicker = () => bannerInputRef.current?.click();
  const openCrestPicker = () => crestInputRef.current?.click();
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
      const crestPrepared = await prepareProfileAvatarForSave({
        file: avatarFile,
        displayUrl: avatarSrc,
        pan: crestPan,
        removed: avatarRemoved,
      });
      if (crestPrepared === null) {
        avatar = null;
      } else if (crestPrepared) {
        const uploaded = await client.storage.upload(crestPrepared);
        avatar = `ipfs://${uploaded.cid}`;
      }
      const coverPrepared = await prepareProfileBannerForSave({
        file: bannerFile,
        displayUrl: bannerSrc,
        pan: coverPan,
        removed: bannerRemoved,
        isVideo: false,
      });
      if (coverPrepared === null) {
        banner = null;
      } else if (coverPrepared) {
        const uploaded = await client.storage.upload(coverPrepared);
        banner = `ipfs://${uploaded.cid}`;
      }

      const normalizedLinks = normalizeProfileLinksInput(links, undefined);
      const { accountId: signerId, wallet } = await getSigningWallet();
      const preparedPhotos = await prepareProfileAboutPhotosForSave(photos);
      const photoRefs: string[] = [];
      for (let index = 0; index < preparedPhotos.photos.length; index += 1) {
        const file = preparedPhotos.photoFiles[index];
        const photo = preparedPhotos.photos[index];
        if (file) {
          const uploaded = await client.storage.upload(file);
          photoRefs.push(formatProfileMediaRef(uploaded));
        } else if (photo?.ref.trim()) {
          photoRefs.push(photo.ref.trim());
        }
      }
      const nextPhotos = parseProfileAboutPhotoRefs(photoRefs);
      const socialDraft = {
        name: name.trim(),
        bio: face.trim() || undefined,
        about: about.trim() || null,
        lead: normalizeProfileLeadInput(lead) || null,
        aboutAlign: normalizeProfileAboutAlign(aboutAlign),
        photos: nextPhotos.length > 0 ? nextPhotos : null,
        avatar,
        banner,
        links: Object.keys(normalizedLinks).length > 0 ? normalizedLinks : null,
      };

      if (isSocial) {
        const socialPayload = buildDaoSocialProfileProposalPayload(socialDraft);
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
        const socialPayload = buildDaoSocialProfileProposalPayload(socialDraft);
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

  const aboutTriggerMeta = profileAboutHasMoreThanFace({
    aboutText: about,
    leadText: lead,
    photoCount: photos.length,
  })
    ? [
        lead.trim() ? 'Lead' : null,
        photos.length > 0
          ? `${photos.length} photo${photos.length === 1 ? '' : 's'}`
          : null,
        about.trim() ? 'More bio' : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'Lead, photos, more'
    : 'Lead, photos, more';

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
          onFocus={scrollFieldIntoView}
          onChange={(event) =>
            setFace(clampFaceEditorInput(event.target.value))
          }
          className={osFieldBorderedClassName}
        />
      </OsField>
      <button
        type="button"
        className="account-editor-about-trigger"
        disabled={pending}
        aria-haspopup="dialog"
        aria-expanded={aboutOpen}
        onClick={() => setAboutOpen(true)}
      >
        <span className="account-editor-about-trigger-label">About</span>
        <span className="account-editor-about-trigger-meta">
          {aboutTriggerMeta}
        </span>
      </button>
    </>
  );

  const editTitle = isSocial
    ? 'Publish OnSocial profile'
    : 'Edit DAO profile';

  const footer = (
    <div
      className={`profile-edit-sheet-footer${
        keyboardOpen ? ' is-keyboard-open' : ''
      }`}
    >
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
  );

  return (
    <>
      <OsPageSheet
        open={open}
        onClose={requestClose}
        onClosed={clearDiscardConfirm}
        surface="page"
        presentation="appear"
        zIndex={SHEET_Z.overShell}
        ariaLabelledBy={titleId}
        backdropLabel="Close"
        moodId={moodId ?? undefined}
        moodStyle={moodStyle}
        panelClassName={`profile-edit-sheet-panel os-page-chrome-appear${
          keyboardOpen ? ' is-keyboard-open is-page-keyboard' : ''
        }`}
        panelStyle={panelStyle}
        bodyClassName="profile-edit-sheet-body"
        header={null}
        footer={footer}
      >
        <OsAppScreen
          title={editTitle}
          glassChrome
          compactChrome
          embedded
          leading={
            <OsIconAction
              ariaLabel={
                isSocial ? 'Back from publish OnSocial' : 'Back from edit DAO'
              }
              disabled={pending}
              onClick={requestClose}
            >
              <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
            </OsIconAction>
          }
          className="profile-edit-slide"
        >
          <span id={titleId} className="sr-only">
            {editTitle}
          </span>
          <OsPageBodyAppear>
            <form
              id={formId}
              className="account-editor-form profile-edit-form"
              onSubmit={(e) => requestProposeConfirm(e)}
            >
              <div className="account-editor-form-main profile-edit-form-main">
                <PortfolioFaceEditorHero
                  ariaLabel="DAO profile"
                  banner={
                    bannerSrc
                      ? {
                          kind: 'image',
                          url: bannerSrc,
                          srcSet: bannerSrcSet ?? undefined,
                        }
                      : null
                  }
                  bannerPan={coverPan}
                  onBannerPanChange={setCoverPan}
                  onBannerPick={openBannerPicker}
                  onRemoveBanner={bannerSrc ? clearBanner : undefined}
                  bannerAddLabel={DAO_CREATE_ADD_COVER}
                  bannerChangeLabel={DAO_CREATE_CHANGE_COVER}
                  bannerRemoveLabel={DAO_CREATE_REMOVE_COVER}
                  markUrl={avatarSrc}
                  markSrcSet={crestSrcSet ?? undefined}
                  markPan={crestPan}
                  onMarkPanChange={setCrestPan}
                  onMarkPick={openCrestPicker}
                  onRemoveMark={avatarSrc ? clearAvatar : undefined}
                  markAddLabel={DAO_CREATE_ADD_CREST}
                  markRemoveLabel={DAO_CREATE_REMOVE_CREST}
                  markFallback="+"
                  profileKind="dao"
                  avatarShape={profileAvatarShapeForFace('org', true)}
                  disabled={pending}
                />

                <div className="account-editor-form-body">
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
                      onFocus={scrollFieldIntoView}
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
                        onFocus={scrollFieldIntoView}
                        onChange={(event) =>
                          setPurpose(
                            event.target.value.slice(0, PROFILE_BIO_MAX)
                          )
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
                      className="account-action-toggle os-disabled-ink dao-edit-publish"
                      role="switch"
                      aria-checked={publishSocial}
                      disabled={pending}
                      onClick={() => {
                        if (!publishSocial) {
                          setFace(
                            clampFaceEditorInput(clampProfileBioFace(purpose))
                          );
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
                </div>
              </div>

              <input
                ref={bannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="account-editor-file-input"
                tabIndex={-1}
                aria-hidden
                disabled={pending}
                onChange={onBannerChange}
              />
              <input
                ref={crestInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="account-editor-file-input"
                tabIndex={-1}
                aria-hidden
                disabled={pending}
                onChange={(event) => void onAvatarChange(event)}
              />
            </form>
          </OsPageBodyAppear>
        </OsAppScreen>
      </OsPageSheet>
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
            ? 'Submit a Call proposal that writes cover, crest, name, Face, and the About page to OnSocial. Live after council approval.'
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
      <ProfileAboutEditorSheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        profileName={name}
        lead={lead}
        onLeadChange={setLead}
        aboutAlign={aboutAlign}
        onAboutAlignChange={setAboutAlign}
        aboutBio={about}
        onAboutBioChange={setAbout}
        tags={[]}
        onTagsChange={() => undefined}
        showCrafts={false}
        industry={baseline.industry}
        photos={photos}
        onPhotosChange={setPhotos}
        disabled={pending}
      />
    </>
  );
}
