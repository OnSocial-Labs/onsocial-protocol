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
  DiscardConfirmFooter,
  discardConfirmFooterA11y,
  OsField,
  OsFieldRemove,
  OsSheetAction,
  OsSheetActions,
  ProfileEditorMediaToolbar,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  buildDaoBrandingMetadata,
  composeDaoBranding,
  type DaoBranding,
} from '@/features/protocol/dao-branding';
import { buildProtocolPolicyConfigPayload } from '@/features/protocol/protocol-policy';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { prepareGuildAvatarFile } from '@/lib/prepare-guild-avatar';
import { isPostImageMime, POST_IMAGE_MAX_BYTES } from '@/lib/post-media';
import { resolveProfileMediaUrl } from '@/lib/profile-display';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const DAO_EDIT_Z = 90;
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
  onSaved: (next: DaoBranding, nextMetadata: string) => void;
}

export function DaoEditSheet({
  open,
  daoAccountId,
  branding,
  configName,
  configPurpose,
  configMetadata,
  onClose,
  onSaved,
}: DaoEditSheetProps) {
  const formId = useId();
  const { getSigningWallet } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();

  const [name, setName] = useState(branding.name);
  const [description, setDescription] = useState(branding.description ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(branding.name);
    setDescription(branding.description ?? '');
    setAvatarFile(null);
    setBannerFile(null);
    setAvatarPreview(null);
    setBannerPreview(null);
    setAvatarRemoved(false);
    setBannerRemoved(false);
    setError(null);
  }, [open, branding]);

  useEffect(
    () => () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    },
    [avatarPreview, bannerPreview]
  );

  const isDirty = useMemo(() => {
    const baselineName = branding.name.trim();
    const baselineDescription = (branding.description ?? '').trim();
    return (
      name.trim() !== baselineName ||
      description.trim() !== baselineDescription ||
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
    branding.description,
    branding.name,
    description,
    name,
  ]);

  const {
    discardConfirmOpen,
    discardTitleId,
    discardBodyId,
    keepEditingRef,
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
      const prepared = await prepareGuildAvatarFile(file);
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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
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
      });
      const payload = buildProtocolPolicyConfigPayload({
        name: onChainName,
        purpose: onChainPurpose,
        metadata,
        description: `Update OnSocial profile for ${name.trim()}.`,
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
        submittedMessage: txToastGovPending.actionSubmitted('DAO profile'),
        successMessage: txToastGovSuccess.actionConfirmed('DAO profile'),
        failureMessage: txToastGovError.actionFailed('DAO profile'),
      });
      if (!confirmed) return;

      const next = composeDaoBranding({
        daoAccountId,
        profile: null,
        config: {
          name: onChainName,
          purpose: onChainPurpose,
          metadata,
        },
      });
      // Prefer just-uploaded media URLs for optimistic portfolio paint.
      const resolvedAvatar = resolveProfileMediaUrl(avatar);
      const resolvedBanner = resolveProfileMediaUrl(banner);
      onSaved(
        {
          ...next,
          name: name.trim(),
          description: description.trim() || null,
          avatar,
          banner,
          avatarUrl: resolvedAvatar ?? next.avatarUrl,
          bannerUrl: resolvedBanner ?? next.bannerUrl,
          bannerMedia: resolvedBanner
            ? { kind: 'image', url: resolvedBanner }
            : next.bannerMedia,
          source: 'metadata',
        },
        metadata
      );
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
        <div
          className={`hub-manage-sheet-footer${
            discardConfirmOpen ? ' is-discard-confirm' : ''
          }`}
          {...discardConfirmFooterA11y(
            discardConfirmOpen,
            discardTitleId,
            discardBodyId
          )}
        >
          {discardConfirmOpen ? (
            <DiscardConfirmFooter
              className="dao-edit-discard-card"
              titleId={discardTitleId}
              bodyId={discardBodyId}
              onDiscard={discard}
              onKeepEditing={keepEditing}
              keepEditingRef={keepEditingRef}
            />
          ) : (
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
          )}
        </div>
      }
    >
      <form id={formId} className="hub-manage-form" onSubmit={(e) => void save(e)}>
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
                    <span className="account-editor-banner-empty" aria-hidden />
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

        <OsField label="Name" htmlFor={`${formId}-name`} hint={`${name.length}/${MAX_NAME}`}>
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
  );
}
