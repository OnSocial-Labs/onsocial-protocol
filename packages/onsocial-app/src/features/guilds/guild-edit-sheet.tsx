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
  ChevronLeftIcon,
  ChoiceDrawerField,
  DiscardConfirmSheet,
  IpfsImg,
  ipfsImgSrcSet,
  OsIconAction,
  OsPageSheet,
  OsSheetAction,
  OsSheetActions,
  ProfileEditorMediaToolbar,
  useDiscardConfirm,
  type ChoiceOption,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { SUPPORT_GUILD_CONNECT_CTA } from '@/features/guilds/support-guild-voice';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  GUILD_MAX_DESCRIPTION_LENGTH,
  GUILD_MAX_NAME_LENGTH,
  mergeGuildOnsocialMetadataPatch,
  normalizeGuildConfig,
  type GuildConfigSnapshot,
} from '@/features/guilds/guild-config';
import { guildAccessLabel } from '@/features/guilds/guild-facts';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  guildEditorTagsEqual,
  normalizeGuildEditorTags,
} from '@/features/guilds/guild-tag-editor';
import { GuildTagsEditor } from '@/features/guilds/guild-tags-editor';
import { guildCoverStyle } from '@/features/guilds/guild-visual';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { usePageKeyboardLift } from '@/hooks/use-page-keyboard-lift';
import {
  APP_COLUMN_HERO_SIZES,
  EDITOR_MARK_SIZES,
  EDITOR_MARK_WIDTHS,
  SCARCE_HERO_WIDTHS,
} from '@/lib/hero-img-variants';
import { useMobileFieldFocusScroll } from '@/hooks/use-mobile-field-focus-scroll';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import { OsEmptyAction } from '@/lib/os-empty-action';
import { prepareSquareOpaqueJpeg } from '@/lib/prepare-square-opaque-jpeg';
import { SHEET_Z } from '@/lib/sheet-z';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const GUILD_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const GUILD_EDIT_Z = SHEET_Z.overShell;
const GUILD_BADGE_MAX_BYTES = 5 * 1024 * 1024;

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

type GuildAccessChoice = 'open' | 'invite';

const GUILD_ACCESS_OPTIONS: ChoiceOption<GuildAccessChoice>[] = [
  {
    value: 'open',
    label: 'Open',
    description: 'Anyone can join and post',
  },
  {
    value: 'invite',
    label: 'Invite only',
    description: 'Anyone can view · join and post need approval',
  },
];

interface GuildEditSheetProps {
  open: boolean;
  groupId: string;
  /** Guild already on the page — first paint uses this. */
  initial: GuildConfigSnapshot;
  onClose: () => void;
  onSaved?: () => void;
}

function applySnapshot(
  normalized: GuildConfigSnapshot,
  setters: {
    setSnapshot: (value: GuildConfigSnapshot) => void;
    setName: (value: string) => void;
    setDescription: (value: string) => void;
    setTags: (value: string[]) => void;
    setAccessGated: (value: boolean) => void;
    setMemberDriven: (value: boolean) => void;
    setBannerFile: (value: File | null) => void;
    setBannerRemoved: (value: boolean) => void;
    setBadgeFile: (value: File | null) => void;
    setBadgeRemoved: (value: boolean) => void;
  }
) {
  setters.setSnapshot(normalized);
  setters.setName(normalized.name);
  setters.setDescription(normalized.description);
  setters.setTags(normalizeGuildEditorTags(normalized.topics));
  setters.setAccessGated(normalized.accessGated);
  setters.setMemberDriven(normalized.memberDriven);
  setters.setBannerFile(null);
  setters.setBannerRemoved(false);
  setters.setBadgeFile(null);
  setters.setBadgeRemoved(false);
}

/**
 * Identity editor for a guild — compose-style page sheet (banner hero + fields).
 * Rooms / structure live in a separate sheet from the settings hub.
 */
export function GuildEditSheet({
  open,
  groupId,
  initial,
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
  const { keyboardOpen, panelStyle } = usePageKeyboardLift(open);

  const [loadState, setLoadState] = useState<
    'ready' | 'missing' | 'error' | 'forbidden'
  >('ready');
  const [snapshot, setSnapshot] = useState<GuildConfigSnapshot>(initial);
  const [memberDriven, setMemberDriven] = useState(initial.memberDriven);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [tags, setTags] = useState(() =>
    normalizeGuildEditorTags(initial.topics)
  );
  const [accessGated, setAccessGated] = useState(initial.accessGated);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [badgeFile, setBadgeFile] = useState<File | null>(null);
  const [badgeRemoved, setBadgeRemoved] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const dirtyRef = useRef(false);
  const accessModeLabel = guildAccessLabel(accessGated, memberDriven);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const badgeInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const bannerPreview = useObjectUrl(bannerFile);
  const badgePreview = useObjectUrl(badgeFile);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      applySnapshot(initial, {
        setSnapshot,
        setName,
        setDescription,
        setTags,
        setAccessGated,
        setMemberDriven,
        setBannerFile,
        setBannerRemoved,
        setBadgeFile,
        setBadgeRemoved,
      });
      setPending(false);
      setError(null);
      setDescriptionFocused(false);
      setLoadState('ready');
      dirtyRef.current = false;
    }
  }

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const client = createReadOnlyOnSocialClient();
      const rawConfig = await client.groups.getConfig(groupId);
      if (!rawConfig) {
        setLoadState('missing');
        return;
      }

      const normalized = normalizeGuildConfig(groupId, rawConfig);
      if (!dirtyRef.current) {
        applySnapshot(normalized, {
          setSnapshot,
          setName,
          setDescription,
          setTags,
          setAccessGated,
          setMemberDriven,
          setBannerFile,
          setBannerRemoved,
          setBadgeFile,
          setBadgeRemoved,
        });
      } else {
        setSnapshot(normalized);
        setMemberDriven(normalized.memberDriven);
      }

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
    void refresh();
  }, [open, refresh, walletLoading]);

  useLayoutEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [description, loadState]);

  const displayBannerUrl = bannerRemoved
    ? null
    : (bannerPreview ?? snapshot?.bannerUrl ?? null);
  const displayBadgeUrl = badgeRemoved
    ? null
    : (badgePreview ?? snapshot?.badgeUrl ?? null);
  // Blob picks bypass; only the guild's existing CDN art variants.
  const bannerSrcSet = ipfsImgSrcSet(displayBannerUrl, SCARCE_HERO_WIDTHS);
  const badgeSrcSet = ipfsImgSrcSet(displayBadgeUrl, EDITOR_MARK_WIDTHS);

  const normalizedTags = useMemo(() => normalizeGuildEditorTags(tags), [tags]);

  const isDirty = useMemo(() => {
    const dirty =
      name.trim() !== snapshot.name ||
      description.trim() !== snapshot.description ||
      accessGated !== snapshot.accessGated ||
      !guildEditorTagsEqual(normalizedTags, snapshot.topics) ||
      bannerFile !== null ||
      bannerRemoved ||
      badgeFile !== null ||
      badgeRemoved;
    dirtyRef.current = dirty;
    return dirty;
  }, [
    accessGated,
    badgeFile,
    badgeRemoved,
    bannerFile,
    bannerRemoved,
    description,
    name,
    normalizedTags,
    snapshot,
  ]);

  const titleId = useId();
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
    if (badgeFile) {
      const uploaded = await client.storage.upload(badgeFile);
      onsocialPatch.badge = {
        cid: uploaded.cid,
        mime: uploaded.mime,
        size: uploaded.size,
      };
    } else if (badgeRemoved && snapshot.badgeUrl) {
      onsocialPatch.badge = null;
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
  const openBadgePicker = () => badgeInputRef.current?.click();
  const handleRemoveBanner = useCallback(() => {
    setBannerFile(null);
    setBannerRemoved(true);
    if (bannerInputRef.current) bannerInputRef.current.value = '';
  }, []);
  const clearBadge = useCallback(() => {
    if (pending) return;
    setBadgeFile(null);
    setBadgeRemoved(true);
  }, [pending]);

  const handleBannerFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > GUILD_BADGE_MAX_BYTES) {
      setError('Banner must be 5 MB or smaller.');
      return;
    }
    const allowed = new Set(
      GUILD_IMAGE_ACCEPT.split(',').map((type) => type.trim())
    );
    if (!allowed.has(file.type.toLowerCase())) {
      setError('Use a PNG, JPG, WebP, or GIF for the banner.');
      return;
    }
    const readable = await new Promise<boolean>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(true);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
    if (!readable) {
      setError('Could not prepare banner.');
      return;
    }
    setBannerFile(file);
    setBannerRemoved(false);
    setError(null);
  };

  const handleBadgeFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > GUILD_BADGE_MAX_BYTES) {
      setError('Badge must be 5 MB or smaller.');
      return;
    }
    try {
      const prepared = await prepareSquareOpaqueJpeg(file);
      setBadgeFile(prepared);
      setBadgeRemoved(false);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not prepare badge.'
      );
    }
  };

  const footer =
    loadState === 'ready' ? (
      <div className="guild-edit-sheet-footer">
        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {!isConnected && !walletLoading ? (
            <OsSheetAction
              type="button"
              variant="primary"
              ready
              onClick={() => void connect()}
            >
              {SUPPORT_GUILD_CONNECT_CTA}
            </OsSheetAction>
          ) : (
            <OsSheetAction
              type="submit"
              form={formId}
              variant="primary"
              ready={isDirty && isConnected}
              pending={pending}
              pendingLabel={memberDriven ? 'Proposing…' : 'Saving…'}
              disabled={!isDirty || pending || !isConnected}
            >
              {memberDriven ? 'Propose changes' : 'Save changes'}
            </OsSheetAction>
          )}
        </OsSheetActions>
      </div>
    ) : undefined;

  return (
    <>
      <OsPageSheet
        open={open}
        onClose={requestClose}
        onClosed={clearDiscardConfirm}
        surface="page"
        presentation="appear"
        zIndex={GUILD_EDIT_Z}
        ariaLabelledBy={titleId}
        backdropLabel="Close"
        panelClassName={`guild-edit-sheet-panel${
          keyboardOpen ? ' is-keyboard-open is-page-keyboard' : ''
        }`}
        panelStyle={panelStyle}
        bodyClassName="guild-edit-sheet-body"
        header={null}
        footer={footer}
      >
        <OsAppScreen
          title="Edit guild"
          glassChrome
          compactChrome
          embedded
          leading={
            <OsIconAction
              ariaLabel="Back"
              disabled={pending}
              onClick={requestClose}
            >
              <ChevronLeftIcon className="glass-sheet-close-icon" aria-hidden />
            </OsIconAction>
          }
          className="guild-edit-slide"
        >
        <span id={titleId} className="sr-only">
          Edit guild
        </span>
        {loadState === 'missing' ? (
          <div className="guild-state-card">
            <p>We could not find this guild yet.</p>
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="guild-state-card is-error">
            <p>{error ?? 'Could not load guild settings.'}</p>
            <OsEmptyAction onClick={() => void refresh()}>Retry</OsEmptyAction>
          </div>
        ) : null}

        {loadState === 'forbidden' ? (
          <div className="guild-state-card">
            <p className="guild-eyebrow">View only</p>
            <h2>Only owners and admins can edit this guild.</h2>
          </div>
        ) : null}

        {loadState === 'ready' ? (
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
                          <IpfsImg
                            src={displayBannerUrl}
                            srcSet={bannerSrcSet}
                            sizes={
                              bannerSrcSet ? APP_COLUMN_HERO_SIZES : undefined
                            }
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
                        corner="bottom"
                        removeLabel={
                          displayBannerUrl ? 'Remove banner' : undefined
                        }
                        onRemove={
                          displayBannerUrl ? handleRemoveBanner : undefined
                        }
                      />
                      {displayBannerUrl ? null : (
                        <p
                          className="profile-editor-media-size-hint profile-editor-media-size-hint--dock"
                          aria-hidden
                        >
                          Photo or video
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="guild-edit-fields">
                  <div className="guild-edit-title-row">
                    <div className="guild-edit-badge-slot">
                      <div
                        className={`guild-edit-badge-picker profile-editor-media-host${
                          displayBadgeUrl ? ' has-media' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="profile-editor-media-backdrop guild-edit-badge-backdrop"
                          onClick={openBadgePicker}
                          aria-label={
                            displayBadgeUrl ? 'Change badge' : 'Add badge'
                          }
                          disabled={pending}
                        >
                          {displayBadgeUrl ? (
                            <IpfsImg
                              src={displayBadgeUrl}
                              srcSet={badgeSrcSet}
                              sizes={
                                badgeSrcSet ? EDITOR_MARK_SIZES : undefined
                              }
                              alt=""
                            />
                          ) : (
                            <span
                              className="guild-edit-badge-empty"
                              aria-hidden
                            >
                              +
                            </span>
                          )}
                          <span
                            className={`profile-editor-media-overlay guild-edit-badge-overlay${
                              displayBadgeUrl ? ' has-media' : ''
                            }`}
                            aria-hidden
                          />
                        </button>
                        <ProfileEditorMediaToolbar
                          layout="avatar"
                          removeLabel={
                            displayBadgeUrl ? 'Remove badge' : undefined
                          }
                          onRemove={
                            displayBadgeUrl ? clearBadge : undefined
                          }
                        />
                      </div>
                    </div>
                    <label
                      className="sr-only"
                      htmlFor={fieldId(formId, 'name')}
                    >
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
                  </div>

                  <div className="guild-hero-meta guild-edit-meta">
                    <span className="guild-hero-mode">{accessModeLabel}</span>
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
                    aria-describedby={
                      descriptionFocused ||
                      description.length > GUILD_MAX_DESCRIPTION_LENGTH * 0.8
                        ? fieldId(formId, 'description-count')
                        : undefined
                    }
                    onChange={(event) => setDescription(event.target.value)}
                    onFocus={(event) => {
                      setDescriptionFocused(true);
                      scrollFieldIntoView(event);
                    }}
                    onBlur={() => {
                      setDescriptionFocused(false);
                      const trimmed = description.trim();
                      if (trimmed !== description) setDescription(trimmed);
                    }}
                  />
                  {descriptionFocused ||
                  description.length > GUILD_MAX_DESCRIPTION_LENGTH * 0.8 ? (
                    <p
                      id={fieldId(formId, 'description-count')}
                      className="guild-edit-limits"
                      aria-live="polite"
                    >
                      {description.length}/{GUILD_MAX_DESCRIPTION_LENGTH}
                    </p>
                  ) : null}
                  <div className="guild-field guild-edit-tags">
                    <span>Topic</span>
                    <GuildTagsEditor
                      tags={tags}
                      onChange={setTags}
                      id={fieldId(formId, 'tags')}
                      disabled={pending}
                    />
                  </div>

                  {!memberDriven ? (
                    <div className="guild-field guild-edit-access">
                      <ChoiceDrawerField
                        label="Access"
                        value={accessGated ? 'invite' : 'open'}
                        options={GUILD_ACCESS_OPTIONS}
                        disabled={pending}
                        persistSelected
                        copy="Who can join and post"
                        zIndex={SHEET_Z.nested}
                        onChange={(next) => setAccessGated(next === 'invite')}
                      />
                    </div>
                  ) : null}

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
                void handleBannerFile(file);
                event.target.value = '';
              }}
            />
            <input
              ref={badgeInputRef}
              type="file"
              accept={GUILD_IMAGE_ACCEPT}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleBadgeFile(file);
                event.target.value = '';
              }}
            />
          </form>
        ) : null}
        </OsAppScreen>
      </OsPageSheet>
      <DiscardConfirmSheet
        open={discardConfirmOpen}
        onDiscard={discard}
        onKeepEditing={keepEditing}
      />
    </>
  );
}
