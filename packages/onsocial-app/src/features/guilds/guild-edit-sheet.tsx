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
import { GlassSheet, ProfileEditorMediaToolbar } from '@onsocial/ui';
import {
  OsSheetAction,
  OsSheetActions,
  OsSheetPrimaryAction,
} from '@/components/ui/os-sheet-primary-action';
import { OsNoticeCard } from '@/components/ui/os-notice-card';
import { AccountEditorChrome } from '@/components/wallet/account-editor-chrome';
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
import { useScrollLock } from '@/hooks/use-scroll-lock';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const GUILD_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

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
 * Identity editor for a guild — same banner-at-sheet-top chrome as Edit profile.
 * Rooms / structure live in a separate sheet from the settings hub.
 */
export function GuildEditSheet({
  open,
  groupId,
  onClose,
  onSaved,
}: GuildEditSheetProps) {
  const titleId = useId();
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

  const [closing, setClosing] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
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
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const dirtyRef = useRef(false);

  const bannerPreview = useObjectUrl(bannerFile);
  const sheetOpen = open && !closing;

  useScrollLock(open || closing);

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
      setClosing(false);
      setDiscardConfirmOpen(false);
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

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);

  const requestClose = useCallback(() => {
    if (pending) return;
    if (dirtyRef.current) {
      setDiscardConfirmOpen(true);
      return;
    }
    setClosing(true);
  }, [pending]);

  const handleClosed = useCallback(() => {
    setClosing(false);
    setDiscardConfirmOpen(false);
    onClose();
  }, [onClose]);

  const handleKeepEditing = useCallback(() => {
    setDiscardConfirmOpen(false);
    queueMicrotask(() => keepEditingRef.current?.focus());
  }, []);

  const handleDiscard = useCallback(() => {
    setDiscardConfirmOpen(false);
    setClosing(true);
  }, []);

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
        setClosing(true);
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

  const statusChrome = (
    <AccountEditorChrome
      titleId={titleId}
      title="Edit guild"
      onClose={requestClose}
      className="account-editor-loading-chrome"
    />
  );

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="os"
      initialDetent="full"
      zIndex={58}
      presentation="swap"
      ariaLabelledBy={titleId}
      backdropLabel="Close edit guild"
      panelClassName="guild-edit-sheet-panel account-editor-panel"
      bodyClassName="guild-edit-sheet-body account-editor-body"
      footer={
        loadState === 'ready' && snapshot ? (
          <div
            className={`guild-edit-sheet-footer${
              discardConfirmOpen ? ' is-discard-confirm' : ''
            }`}
            role={discardConfirmOpen ? 'alertdialog' : undefined}
            aria-modal={discardConfirmOpen || undefined}
            aria-labelledby={
              discardConfirmOpen ? 'guild-edit-discard-title' : undefined
            }
            aria-describedby={
              discardConfirmOpen ? 'guild-edit-discard-copy' : undefined
            }
          >
            {discardConfirmOpen ? (
              <OsNoticeCard
                className="guild-edit-discard-card"
                align="center"
                shell
                title="Discard changes?"
                titleId="guild-edit-discard-title"
                body="Edits won’t be saved."
                bodyId="guild-edit-discard-copy"
                footer={
                  <div className="os-commit-actions">
                    <button
                      type="button"
                      className="os-commit-cancel is-danger"
                      onClick={handleDiscard}
                    >
                      Discard
                    </button>
                    <OsSheetActions
                      layout="row-compact"
                      tone="frosted-primary"
                      borderless
                    >
                      <OsSheetAction
                        ref={keepEditingRef}
                        type="button"
                        variant="primary"
                        ready
                        onClick={handleKeepEditing}
                      >
                        Keep editing
                      </OsSheetAction>
                    </OsSheetActions>
                  </div>
                }
              />
            ) : (
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
                <OsSheetPrimaryAction
                  type="submit"
                  form={formId}
                  ready={isDirty && isConnected}
                  pending={pending}
                  pendingLabel={memberDriven ? 'Proposing…' : 'Saving…'}
                  disabled={!isDirty || pending || !isConnected}
                >
                  {memberDriven ? 'Propose changes' : 'Save changes'}
                </OsSheetPrimaryAction>
              </OsSheetActions>
            )}
          </div>
        ) : undefined
      }
    >
      {loadState === 'loading' || loadState === 'idle' ? (
        <>
          {statusChrome}
          <div className="guild-state-card">Loading guild…</div>
        </>
      ) : null}

      {loadState === 'missing' ? (
        <>
          {statusChrome}
          <div className="guild-state-card">
            <p>We could not find this guild yet.</p>
          </div>
        </>
      ) : null}

      {loadState === 'error' ? (
        <>
          {statusChrome}
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
        </>
      ) : null}

      {loadState === 'forbidden' ? (
        <>
          {statusChrome}
          <div className="guild-state-card">
            <p className="guild-eyebrow">View only</p>
            <h2>Only owners and admins can edit this guild.</h2>
          </div>
        </>
      ) : null}

      {loadState === 'ready' && snapshot ? (
        <form
          id={formId}
          className={`guild-edit-form account-editor-form${
            discardConfirmOpen ? ' is-discard-confirm' : ''
          }`}
          onSubmit={(event) => void handleSave(event)}
        >
          <div
            className={`account-editor-form-main guild-edit-form-main${
              discardConfirmOpen ? ' is-discard-confirm' : ''
            }`}
          >
            <section
              className={`account-editor-hero guild-edit-hero${
                discardConfirmOpen ? ' is-dimmed' : ''
              }`}
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

              <AccountEditorChrome
                titleId={titleId}
                title="Edit guild"
                onClose={requestClose}
                className="account-editor-hero-chrome"
              />
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
    </GlassSheet>
  );
}
