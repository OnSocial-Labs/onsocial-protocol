'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  OsSheetAction,
  OsSheetActions,
  OsSheetPrimaryAction,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  collectRelayTxHashes,
  guildPath,
} from '@/features/guilds/guilds-data';
import {
  normalizeGuildConfig,
  type GuildConfigSnapshot,
} from '@/features/guilds/guild-config';
import { GuildTagsEditor } from '@/features/guilds/guild-tags-editor';
import {
  guildEditorTagsEqual,
  normalizeGuildEditorTags,
} from '@/features/guilds/guild-tag-editor';
import {
  cloneGuildStructure,
  guildStructureForMetadata,
  guildStructuresEqual,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import { GuildStructureSettingsSection } from '@/features/guilds/guild-structure-settings-section';
import {
  aggregateChannelsFromPosts,
  type DiscoveredChannelUsage,
} from '@/features/guilds/guild-structure-discovery';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import {
  guildCoverStyle,
} from '@/features/guilds/guild-visual';
import { guildDisplayInitials } from '@/features/guilds/guild-card-display';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function fieldId(name: string) {
  return `guild-settings-${name}`;
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

export function LiveGuildSettingsPanel({ groupId }: { groupId: string }) {
  const router = useRouter();
  const { accountId, isConnected, isLoading: walletLoading, connect } =
    useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();

  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'missing' | 'error' | 'forbidden'
  >('loading');
  const [snapshot, setSnapshot] = useState<GuildConfigSnapshot | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [memberDriven, setMemberDriven] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [accessGated, setAccessGated] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [structure, setStructure] = useState<GuildStructureDocument | null>(
    null
  );
  const [discoveredChannels, setDiscoveredChannels] = useState<
    DiscoveredChannelUsage[]
  >([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerPreview = useObjectUrl(bannerFile);
  const avatarPreview = useObjectUrl(avatarFile);

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
      setTags(normalizeGuildEditorTags(normalized.tags));
      setAccessGated(normalized.accessGated);
      setMemberDriven(normalized.memberDriven);
      setStructure(cloneGuildStructure(normalized.structure));
      setBannerFile(null);
      setBannerRemoved(false);
      setAvatarFile(null);
      setAvatarRemoved(false);

      if (!accountId) {
        setCanEdit(false);
        setLoadState('ready');
        return;
      }

      const [isOwner, isAdmin] = await Promise.all([
        client.groups.isOwner(groupId, accountId),
        client.groups.isAdmin(groupId, accountId),
      ]);
      setCanEdit(isOwner || isAdmin);
      setLoadState(isOwner || isAdmin ? 'ready' : 'forbidden');
    } catch (cause) {
      setLoadState('error');
      setError(
        cause instanceof Error ? cause.message : 'Could not load guild settings.'
      );
    }
  }, [accountId, groupId]);

  useEffect(() => {
    if (walletLoading) return;
    void load();
  }, [load, walletLoading]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    let cancelled = false;

    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const channels = await client.query.groups.postChannelSample(groupId, {
          limit: 120,
        });
        if (!cancelled) {
          setDiscoveredChannels(
            aggregateChannelsFromPosts(
              channels.map((channel) => ({ channel }))
            )
          );
        }
      } catch {
        if (!cancelled) setDiscoveredChannels([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId, loadState]);

  const displayBannerUrl = bannerRemoved
    ? null
    : (bannerPreview ?? snapshot?.bannerUrl ?? null);
  const displayAvatarUrl = avatarRemoved
    ? null
    : (avatarPreview ?? snapshot?.avatarUrl ?? null);

  const normalizedTags = useMemo(
    () => normalizeGuildEditorTags(tags),
    [tags]
  );

  const isDirty = useMemo(() => {
    if (!snapshot || !structure) return false;
    return (
      name.trim() !== snapshot.name ||
      description.trim() !== snapshot.description ||
      accessGated !== snapshot.accessGated ||
      !guildEditorTagsEqual(normalizedTags, snapshot.tags) ||
      !guildStructuresEqual(structure, snapshot.structure) ||
      bannerFile !== null ||
      bannerRemoved ||
      avatarFile !== null ||
      avatarRemoved
    );
  }, [
    accessGated,
    avatarFile,
    avatarRemoved,
    bannerFile,
    bannerRemoved,
    description,
    name,
    normalizedTags,
    snapshot,
    structure,
  ]);

  const buildMetadataChanges = async (): Promise<Record<string, unknown>> => {
    if (!snapshot || !structure) return {};
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
    if (!guildEditorTagsEqual(normalizedTags, snapshot.tags)) {
      changes.tags = normalizedTags;
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
    if (avatarFile) {
      const uploaded = await client.storage.upload(avatarFile);
      changes.avatar = {
        cid: uploaded.cid,
        mime: uploaded.mime,
        size: uploaded.size,
      };
    } else if (avatarRemoved && snapshot.avatarUrl) {
      changes.avatar = null;
    }
    if (!guildStructuresEqual(structure, snapshot.structure)) {
      onsocialPatch.structure = guildStructureForMetadata(structure);
    }
    if (Object.keys(onsocialPatch).length > 0) {
      changes.x = { onsocial: onsocialPatch };
    }

    return changes;
  };

  const handleSave = async () => {
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
          ? await client.groups.proposeMetadataUpdate(groupId, metadataChanges, {
              reason: 'Guild profile update',
              autoVote: true,
            })
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
        await load();
        router.refresh();
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save guild settings.'
      );
    } finally {
      setPending(false);
    }
  };

  const title = snapshot?.name ?? groupId;

  return (
    <OsAppScreen
      title="Guild settings"
      subtitle={title}
      backFallbackHref={guildPath(groupId)}
    >
      <div className="guilds-page">
        {loadState === 'loading' ? (
          <section className="guild-state-card">Loading guild settings…</section>
        ) : null}

        {loadState === 'missing' ? (
          <section className="guild-hero-card">
            <p className="guild-eyebrow">Not found</p>
            <h2>We could not find this guild yet.</h2>
          </section>
        ) : null}

        {loadState === 'error' ? (
          <section className="guild-state-card is-error">
            <p>{error ?? 'Could not load guild settings.'}</p>
            <button
              className="guild-secondary-button"
              type="button"
              onClick={() => void load()}
            >
              Retry
            </button>
          </section>
        ) : null}

        {loadState === 'forbidden' ? (
          <section className="guild-state-card">
            <p className="guild-eyebrow">View only</p>
            <h2>Only owners and admins can edit guild settings.</h2>
            <p>
              Public chain data stays visible to everyone. Editing name, bio,
              banner, and access controls requires owner or admin permissions.
            </p>
          </section>
        ) : null}

        {loadState === 'ready' && snapshot && canEdit ? (
          <form
            className="guild-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <section className="guild-settings-media">
              <div
                className={`guild-settings-banner${displayBannerUrl ? '' : ' guild-hero-cover--fallback'}`}
                style={
                  displayBannerUrl
                    ? undefined
                    : guildCoverStyle(null, groupId)
                }
              >
                {displayBannerUrl ? (
                  <img src={displayBannerUrl} alt="" />
                ) : null}
                <button
                  type="button"
                  className="guild-settings-media-button"
                  onClick={() => bannerInputRef.current?.click()}
                >
                  Change banner
                </button>
                {displayBannerUrl ? (
                  <button
                    type="button"
                    className="guild-settings-media-button guild-settings-media-button--ghost"
                    onClick={() => {
                      setBannerFile(null);
                      setBannerRemoved(true);
                    }}
                  >
                    Remove banner
                  </button>
                ) : null}
              </div>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setBannerFile(file);
                  if (file) setBannerRemoved(false);
                }}
              />

              <div className="guild-settings-avatar-row">
                <div
                  className={`guild-settings-avatar${
                    displayAvatarUrl ? '' : ' guild-hero-avatar--fallback'
                  }`}
                  style={
                    displayAvatarUrl
                      ? undefined
                      : guildCoverStyle(null, groupId)
                  }
                  aria-hidden
                >
                  {displayAvatarUrl ? (
                    <img src={displayAvatarUrl} alt="" />
                  ) : (
                    <span>
                      {guildDisplayInitials(name || snapshot?.name, groupId)}
                    </span>
                  )}
                </div>
                <div className="guild-settings-avatar-actions">
                  <button
                    type="button"
                    className="guild-settings-avatar-button"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {displayAvatarUrl ? 'Change avatar' : 'Add avatar'}
                  </button>
                  {displayAvatarUrl ? (
                    <button
                      type="button"
                      className="guild-settings-avatar-button guild-settings-avatar-button--ghost"
                      onClick={() => {
                        setAvatarFile(null);
                        setAvatarRemoved(true);
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                  <small>Shown on the guild page over the banner.</small>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setAvatarFile(file);
                    if (file) setAvatarRemoved(false);
                  }}
                />
              </div>
            </section>

            <label className="guild-field" htmlFor={fieldId('id')}>
              <span>Guild ID</span>
              <input id={fieldId('id')} value={groupId} readOnly />
              <small>Permanent address for this guild.</small>
            </label>

            <label className="guild-field" htmlFor={fieldId('name')}>
              <span>Name</span>
              <input
                id={fieldId('name')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={64}
              />
            </label>

            <label className="guild-field" htmlFor={fieldId('description')}>
              <span>Description</span>
              <textarea
                id={fieldId('description')}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={240}
              />
            </label>

            <div className="guild-field">
              <span>Tags</span>
              <GuildTagsEditor
                tags={tags}
                onChange={setTags}
                id={fieldId('tags')}
              />
            </div>

            <div className="guild-toggle-grid">
              <label className="guild-toggle-card">
                <input
                  type="checkbox"
                  checked={accessGated}
                  disabled={memberDriven}
                  onChange={(event) => setAccessGated(event.target.checked)}
                />
                <span>
                  <strong>Access-gated membership</strong>
                  <small>
                    Chain data stays public; joining and posting require
                    membership.
                  </small>
                </span>
              </label>
            </div>

            {structure ? (
              <GuildStructureSettingsSection
                structure={structure}
                onChange={setStructure}
                disabled={pending}
                discoveredChannels={discoveredChannels}
              />
            ) : null}

            {memberDriven ? (
              <p className="guild-public-note">
                Collaborative guilds submit profile changes as proposals. Privacy
                stays access-gated on-chain.
              </p>
            ) : (
              <p className="guild-public-note">
                Owner-led guilds save profile changes directly. Guild ID stays
                fixed; name, bio, banner, and access can change any time.
              </p>
            )}

            {error ? <p className="guild-form-error">{error}</p> : null}

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
                ready={isDirty && isConnected}
                pending={pending}
                pendingLabel={memberDriven ? 'Proposing…' : 'Saving…'}
                disabled={!isDirty || pending || !isConnected}
              >
                {memberDriven ? 'Propose changes' : 'Save changes'}
              </OsSheetPrimaryAction>
            </OsSheetActions>
          </form>
        ) : null}
      </div>
    </OsAppScreen>
  );
}
