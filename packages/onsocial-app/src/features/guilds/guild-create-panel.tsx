'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  OsSheetAction,
  OsSheetActions,
  OsSheetPrimaryAction,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import {
  collectRelayTxHashes,
  normalizeGuildIdInput,
} from '@/features/guilds/guilds-data';
import { GuildTagsEditor } from '@/features/guilds/guild-tags-editor';
import { normalizeGuildEditorTags } from '@/features/guilds/guild-tag-editor';
import {
  GUILD_MAX_DESCRIPTION_LENGTH,
  GUILD_MAX_NAME_LENGTH,
} from '@/features/guilds/guild-config';
import {
  DEFAULT_GUILD_STRUCTURE,
  guildStructureForMetadata,
} from '@/features/guilds/guild-structure';

function fieldId(name: string) {
  return `guild-create-${name}`;
}

export function GuildCreatePanel() {
  const router = useRouter();
  const { isConnected, isLoading, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction } = useAppTransactionFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [accessGated, setAccessGated] = useState(false);
  const [memberDriven, setMemberDriven] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupId = useMemo(
    () => normalizeGuildIdInput(slug || name),
    [name, slug]
  );
  const canSubmit =
    groupId.length >= 3 && name.trim().length >= 2 && !pending && isConnected;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isConnected) {
      await connect();
      return;
    }

    if (!canSubmit) {
      setError('Add a guild name and an ID with at least 3 characters.');
      return;
    }

    if (memberDriven && !accessGated) {
      setError(
        'Collaborative governance guilds must be access-gated on the core contract today.'
      );
      return;
    }

    if (name.trim().length > GUILD_MAX_NAME_LENGTH) {
      setError(`Guild name must be ${GUILD_MAX_NAME_LENGTH} characters or fewer.`);
      return;
    }
    if (description.trim().length > GUILD_MAX_DESCRIPTION_LENGTH) {
      setError(
        `Description must be ${GUILD_MAX_DESCRIPTION_LENGTH} characters or fewer.`
      );
      return;
    }

    setPending(true);
    try {
      const { client } = await getClient();
      const response = await client.groups.create(groupId, {
        v: 1,
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate: accessGated,
        memberDriven,
        tags: normalizeGuildEditorTags(tags),
        x: {
          onsocial: {
            structure: guildStructureForMetadata(DEFAULT_GUILD_STRUCTURE),
          },
        },
      });
      const txHashes = collectRelayTxHashes(response);
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastConfirming.creatingGuild,
        successMessage: txToastSuccess.guildCreated,
        failureMessage: txToastError.guildCreateFailed,
      });

      if (confirmed) {
        router.push(`/groups/${encodeURIComponent(groupId)}`);
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setError(
        cause instanceof Error ? cause.message : 'Could not create guild.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <OsAppScreen
      title="Create guild"
      subtitle="Name the guild, choose access, and decide whether governance is owner-led or collaborative."
      backFallbackHref="/groups"
    >
      <form className="guild-create-form" onSubmit={handleSubmit}>
        <section className="guild-hero-card">
          <p className="guild-eyebrow">Step 1</p>
          <h2>Start with the social promise.</h2>
          <p>
            Guilds should feel like places people want to join: a clear purpose,
            a readable ID, and room for feeds, members, and roles.
          </p>
        </section>

        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Builder Room"
            maxLength={GUILD_MAX_NAME_LENGTH}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Guild ID</span>
          <input
            id={fieldId('id')}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder={groupId || 'builder-room'}
            maxLength={40}
          />
          <small>Stored as `groupId`: {groupId || 'choose-a-name'}</small>
        </label>

        <label className="guild-field" htmlFor={fieldId('description')}>
          <span>Description</span>
          <textarea
            id={fieldId('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="An access-gated room for shipping, proposals, and member resources."
            maxLength={GUILD_MAX_DESCRIPTION_LENGTH}
            aria-describedby={fieldId('description-count')}
          />
          <small id={fieldId('description-count')}>
            {description.length}/{GUILD_MAX_DESCRIPTION_LENGTH}
          </small>
        </label>

        <div className="guild-field">
          <span>Tags</span>
          <GuildTagsEditor tags={tags} onChange={setTags} id={fieldId('tags')} />
        </div>

        <div className="guild-toggle-grid">
          <label className="guild-toggle-card">
            <input
              type="checkbox"
              checked={accessGated}
              onChange={(event) => setAccessGated(event.target.checked)}
            />
            <span>
              <strong>Invite only</strong>
              <small>
                Anyone can view the guild; joining and posting need approval.
              </small>
            </span>
          </label>
          <label className="guild-toggle-card">
            <input
              type="checkbox"
              checked={memberDriven}
              onChange={(event) => {
                setMemberDriven(event.target.checked);
                if (event.target.checked) setAccessGated(true);
              }}
            />
            <span>
              <strong>Collaborative governance</strong>
              <small>
                Role and permission changes route through proposals.
              </small>
            </span>
          </label>
        </div>

        <section className="guild-section">
          <div className="guild-section-head">
            <p className="guild-eyebrow">Public by default</p>
            <h2>Invite only does not mean hidden.</h2>
            <p>
              Guild activity stays visible. Invite only controls who can join
              and post — not who can read the guild.
            </p>
          </div>
        </section>

        {error ? <p className="guild-form-error">{error}</p> : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {!isConnected && !isLoading ? (
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
            ready={canSubmit}
            pending={pending}
            pendingLabel="Creating…"
            disabled={!canSubmit}
          >
            Create guild
          </OsSheetPrimaryAction>
        </OsSheetActions>
      </form>
    </OsAppScreen>
  );
}
