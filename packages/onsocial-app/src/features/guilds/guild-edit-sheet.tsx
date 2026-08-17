'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  DiscardConfirmSheet,
  ProfileEditorMediaToolbar,
  useDiscardConfirm,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { OsSheetAction, OsSheetActions } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  GUILD_MAX_DESCRIPTION_LENGTH,
  GUILD_MAX_NAME_LENGTH,
  mergeGuildOnsocialMetadataPatch,
  normalizeGuildConfig,
  type GuildConfigSnapshot,
} from '@/features/guilds/guild-config';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  guildEditorTagsEqual,
  normalizeGuildEditorTags,
} from '@/features/guilds/guild-tag-editor';
import { GuildTagsEditor } from '@/features/guilds/guild-tags-editor';
import { guildCoverStyle } from '@/features/guilds/guild-visual';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const GUILD_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const GUILD_EDIT_Z = 58;

function fieldId(prefix: string, name: string) {
  return `${prefix}-${name}`;
}

function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

interface GuildEditSheetProps {
  open: boolean;
  groupId: string;
  onClose: () => void;
  onSaved?: () => void;
}

/**
 * Identity editor for a guild — side slide workspace (banner hero + fields).
 * Rooms / structure live in a separate sheet from the settings hub.
 */
export function GuildEditSheet({
  open,
  groupId,
  onClose,
  onSaved,
}: GuildEditSheetProps) {
  const formId = useId();
  const {
    accountId,
    isConnected,
    isLoading: walletLoading,
    connect,
  } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const scrollFieldIntoView = useMobileFieldFocusScroll();

  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'missing' | 'error' | 'forbidden'
  >('idle');
  const [snapshot, setSnapshot] = useState<GuildConfigSnapshot | null>(null);
  const [memberDriven, setMemberDriven] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [accessGated, setAccessGated] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const bannerPreview = useObjectUrl(bannerFile);

  const load = useCallback(async () => {
    setLoadState('loading');
    setError(null);
    try {
      const client = createReadOnlyOnSocialClient();
      const rawConfig = await client.groups.getConfig(groupId);
      if (!rawConfig) {
        setLoadState('missing');
        return;
      }

      const normalized = normalizeGuildConfig(groupId, rawConfig);
      setSnapshot(normalized);
      setName(normalized.name);
      setDescription(normalized.description);
      setTags(normalizeGuildEditorTags(normalized.topics));
      setAccessGated(normalized.accessGated);
      setMemberDriven(normalized.memberDriven);
      setBannerFile(null);
      setBannerRemoved(false);

      if (!accountId) {
        setLoadState('forbidden');
        return;
      }

      const [isOwner, isAdmin] = await Promise.all([
        client.groups.isOwner(groupId, accountId),
        client.groups.isAdmin(groupId, accountId),
      ]);
      setLoadState(isOwner || isAdmin ? 'ready' : 'forbidden');
    } catch (cause) {
      setLoadState('error');
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load guild settings.'
      );
    }
  }, [accountId, groupId]);

  useEffect(() => {
    if (!open || walletLoading) return;
    void load();
  }, [load, open, walletLoading]);

  useEffect(() => {
    if (!open) {
      setLoadState('idle');
      setError(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [description, loadState]);

  const displayBannerUrl = bannerRemoved
    ? null
    : (bannerPreview ?? snapshot?.bannerUrl ?? null);

  const normalizedTags = useMemo(() => normalizeGuildEditorTags(tags), [tags]);

  const isDirty = useMemo(() => {
    if (!snapshot) return false;
    return (
      name.trim() !== snapshot.name ||
      description.trim() !== snapshot.description ||
      accessGated !== snapshot.accessGated ||
      !guildEditorTagsEqual(normalizedTags, snapshot.topics) ||
      bannerFile !== null ||
      bannerRemoved
    );
  }, [
    accessGated,
    bannerFile,
    bannerRemoved,
    description,
    name,
    normalizedTags,
    snapshot,
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

  const buildMetadataChanges = async (): Promise<Record<string, unknown>> => {
    if (!snapshot) return {};
    const { client } = await getClient();
    const changes: Record<string, unknown> = {};
    const onsocialPatch: Record<string, unknown> = {};

    const trimmedName = name.trim();
    if (trimmedName && trimmedName !== snapshot.name) {
      changes.name = trimmedName;
    }
    if (description.trim() !== snapshot.description) {
      changes.description = description.trim();
    }
    if (!guildEditorTagsEqual(normalizedTags, snapshot.topics)) {
      changes.topics = normalizedTags;
    }
    if (bannerFile) {
      const uploaded = await client.storage.upload(bannerFile);
      onsocialPatch.banner = {
        cid: uploaded.cid,
        mime: uploaded.mime,
        size: uploaded.size,
      };
    } else if (bannerRemoved && snapshot.bannerUrl) {
      onsocialPatch.banner = null;
    }
    if (Object.keys(onsocialPatch).length > 0) {
      const existing = await client.groups.getConfig(groupId);
      Object.assign(
        changes,
        mergeGuildOnsocialMetadataPatch(existing, onsocialPatch)
      );
    }
    return changes;
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!snapshot || pending || !isDirty) return;
    setError(null);

    if (!isConnected) {
      await connect();
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Guild name is required.');
      return;
    }
    if (trimmedName.length > GUILD_MAX_NAME_LENGTH) {
      setError(
        `Guild name must be ${GUILD_MAX_NAME_LENGTH} characters or fewer.`
      );
      return;
    }
    if (description.trim().length > GUILD_MAX_DESCRIPTION_LENGTH) {
      setError(
        `Description must be ${GUILD_MAX_DESCRIPTION_LENGTH} characters or fewer.`
      );
      return;
    }
    if (memberDriven && !accessGated) {
      setError('Collaborative guilds must stay access-gated.');
      return;
    }

    setPending(true);
    try {
      const { client } = await getClient();
      const metadataChanges = await buildMetadataChanges();
      const privacyChanged = accessGated !== snapshot.accessGated;
      let confirmed = true;

      if (Object.keys(metadataChanges).length > 0) {
        const response = memberDriven
          ? await client.groups.proposeMetadataUpdate(
              groupId,
              metadataChanges,
              {
                reason: 'Guild profile update',
                autoVote: true,
              }
            )
          : await client.groups.updateMetadata(groupId, metadataChanges);

        confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: memberDriven
            ? txToastConfirming.proposingGuildUpdate
            : txToastConfirming.savingGuildSettings,
          successMessage: memberDriven
            ? txToastSuccess.guildUpdateProposed
            : txToastSuccess.guildSettingsSaved,
          failureMessage: txToastError.guildSettingsFailed,
        });
      }

      if (confirmed && privacyChanged && !memberDriven) {
        const privacyResponse = await client.groups.setPrivacy(
          groupId,
          accessGated
        );
        confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(privacyResponse),
          submittedMessage: txToastConfirming.savingGuildSettings,
          successMessage: txToastSuccess.guildSettingsSaved,
          failureMessage: txToastError.guildSettingsFailed,
        });
      }

      if (confirmed) {
        onSaved?.();
        onClose();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg: txToastError.guildSettingsFailed,
      });
    } finally {
      setPending(false);
    }
  };

  const openBannerPicker = () => bannerInputRef.current?.click();

  const footer =
    loadState === 'ready' && snapshot ? (
      <div className="guild-edit-sheet-footer">
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {!isConnected && !walletLoading ? (
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
            form={formId}
            ready={isDirty && isConnected}
            pending={pending}
            pendingLabel={memberDriven ? 'Proposing…' : 'Saving…'}
            disabled={!isDirty || pending || !isConnected}
          >
            {memberDriven ? 'Propose changes' : 'Save changes'}
          </OsSheetAction>
        </OsSheetActions>
      </div>
    ) : undefined;

  return (
    <>
      <OsSlideOverScreen
        open={open}
        onClose={onClose}
        onClosed={clearDiscardConfirm}
        onBeforeClose={requestCloseOrConfirm}
        title="Edit guild"
        closeAriaLabel="Back"
        closeDisabled={pending}
        zIndex={GUILD_EDIT_Z}
        className="guild-edit-slide"
        contentClassName="guild-edit-slide-body"
        immersiveHeader
        footer={footer}
      >
        {loadState === 'loading' || loadState === 'idle' ? (
          <div className="guild-state-card">Loading guild…</div>
        ) : null}

        {loadState === 'missing' ? (
          <div className="guild-state-card">
            <p>We could not find this guild yet.</p>
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="guild-state-card is-error">
            <p>{error ?? 'Could not load guild settings.'}</p>
            <button
              type="button"
              className="guild-secondary-button"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {loadState === 'forbidden' ? (
          <div className="guild-state-card">
            <p className="guild-eyebrow">View only</p>
            <h2>Only owners and admins can edit this guild.</h2>
          </div>
        ) : null}

        {loadState === 'ready' && snapshot ? (
          <form
            id={formId}
            className="guild-edit-form account-editor-form"
            onSubmit={(event) => void handleSave(event)}
          >
            <div className="account-editor-form-main guild-edit-form-main">
              <section
                className="account-editor-hero guild-edit-hero"
                aria-label="Guild profile"
              >
                <div
                  className={`account-editor-cover-stage${
                    displayBannerUrl ? ' has-media' : ''
                  }`}
                >
                  <div className="account-editor-banner-wrap">
                    <div
                      className={`account-editor-banner-button profile-editor-media-host${
                        displayBannerUrl ? ' has-media' : ''
                      }${!displayBannerUrl ? ' guild-hero-cover--fallback' : ''}`}
                      style={guildCoverStyle(displayBannerUrl, groupId)}
                    >
                      <button
                        type="button"
                        className="profile-editor-media-backdrop account-editor-banner-backdrop"
                        onClick={openBannerPicker}
                        aria-label={
                          displayBannerUrl ? 'Change banner' : 'Add banner'
                        }
                      >
                        {displayBannerUrl ? (
                          <img
                            src={displayBannerUrl}
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
                          className={`account-editor-banner-overlay${
                            displayBannerUrl ? ' has-media' : ''
                          }`}
                          aria-hidden
                        />
                      </button>
                      <ProfileEditorMediaToolbar
                        layout="banner"
                        removeLabel={
                          displayBannerUrl ? 'Remove banner' : undefined
                        }
                        onRemove={
                          displayBannerUrl
                            ? () => {
                                setBannerFile(null);
                                setBannerRemoved(true);
                              }
                            : undefined
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="guild-edit-fields">
                  <label className="sr-only" htmlFor={fieldId(formId, 'name')}>
                    Guild name
                  </label>
                  <input
                    id={fieldId(formId, 'name')}
                    className="guild-edit-name"
                    value={name}
                    maxLength={GUILD_MAX_NAME_LENGTH}
                    placeholder="Guild name"
                    disabled={pending}
                    aria-required="true"
                    onChange={(event) => setName(event.target.value)}
                    onFocus={scrollFieldIntoView}
                    onBlur={() => {
                      const trimmed = name.trim().replace(/\s+/g, ' ');
                      if (trimmed !== name) setName(trimmed);
                    }}
                  />

                  <div className="guild-hero-meta guild-edit-meta">
                    <span className="guild-edit-id" title={groupId}>
                      {groupId}
                    </span>
                  </div>

                  <label
                    className="sr-only"
                    htmlFor={fieldId(formId, 'description')}
                  >
                    Description
                  </label>
                  <textarea
                    ref={descriptionRef}
                    id={fieldId(formId, 'description')}
                    className="guild-edit-description"
                    value={description}
                    maxLength={GUILD_MAX_DESCRIPTION_LENGTH}
                    disabled={pending}
                    rows={2}
                    placeholder="What is this guild about?"
                    aria-describedby={fieldId(formId, 'description-count')}
                    onChange={(event) => setDescription(event.target.value)}
                    onFocus={scrollFieldIntoView}
                    onBlur={() => {
                      const trimmed = description.trim();
                      if (trimmed !== description) setDescription(trimmed);
                    }}
                  />
                  <p
                    id={fieldId(formId, 'description-count')}
                    className="guild-edit-limits"
                    aria-live="polite"
                  >
                    {description.length}/{GUILD_MAX_DESCRIPTION_LENGTH}
                  </p>
                  <div className="guild-field guild-edit-tags">
                    <span>Topic</span>
                    <GuildTagsEditor
                      tags={tags}
                      onChange={setTags}
                      id={fieldId(formId, 'tags')}
                      disabled={pending}
                    />
                  </div>

                  <div className="guild-field guild-edit-access">
                    <span>Access</span>
                    <div
                      className="app-storage-presets"
                      role="radiogroup"
                      aria-label="Guild access"
                    >
                      {memberDriven ? (
                        <button
                          type="button"
                          role="radio"
                          aria-checked
                          className="os-surface-chip is-selected"
                          disabled
                        >
                          Collaborative
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={!accessGated}
                            className={`os-surface-chip${
                              !accessGated ? ' is-selected' : ''
                            }`}
                            disabled={pending}
                            onClick={() => setAccessGated(false)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={accessGated}
                            className={`os-surface-chip${
                              accessGated ? ' is-selected' : ''
                            }`}
                            disabled={pending}
                            onClick={() => setAccessGated(true)}
                          >
                            Invite only
                          </button>
                        </>
                      )}
                    </div>
                    <small>
                      {memberDriven
                        ? 'Invite only · role changes go through proposals.'
                        : accessGated
                          ? 'Anyone can view · join and post need approval.'
                          : 'Open · anyone can join and post.'}
                    </small>
                  </div>

                  {error ? <p className="guild-form-error">{error}</p> : null}
                </div>
              </section>
            </div>

            <input
              ref={bannerInputRef}
              type="file"
              accept={GUILD_IMAGE_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setBannerFile(file);
                if (file) setBannerRemoved(false);
              }}
            />
          </form>
        ) : null}
      </OsSlideOverScreen>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
      />
    </>
  );
}
