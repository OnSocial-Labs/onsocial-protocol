'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  OsSheetAction,
  OsSheetActions,
  OsIconAction,
  QuestionMarkCircleFillIcon,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { InfoDrawer } from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppOnSocialClient } from '@/hooks/use-app-onsocial-client';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  useEntityIdAvailability,
} from '@/hooks/use-entity-id-availability';
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

const GUILD_CREATE_HELP_TITLE = 'Your guild';

const GUILD_CREATE_HELP_SUMMARY =
  'A room with a purpose — feeds, members, roles.';

const GUILD_CREATE_HELP_DETAIL =
  'Everyone can read. Invite only gates joining and posting. Guild ID sticks. Collaborative governance routes changes through proposals.';

const GUILD_MIN_ID = 3;

export function GuildCreatePanel() {
  const router = useRouter();
  const { isConnected, isLoading, connect } = useAppWallet();
  const { getClient } = useAppOnSocialClient();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [accessGated, setAccessGated] = useState(false);
  const [memberDriven, setMemberDriven] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const groupId = useMemo(
    () => normalizeGuildIdInput(slugTouched ? slug || name : name),
    [name, slug, slugTouched]
  );
  const idAvailability = useEntityIdAvailability(
    'guild',
    groupId,
    GUILD_MIN_ID
  );
  const idAvailabilityClass = entityIdAvailabilityClass(idAvailability);
  const canSubmit =
    groupId.length >= GUILD_MIN_ID &&
    name.trim().length >= 2 &&
    !pending &&
    isConnected &&
    idAvailability !== 'taken' &&
    idAvailability !== 'checking';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isConnected) {
      await connect();
      return;
    }

    if (!canSubmit) {
      if (idAvailability === 'taken') {
        setError('That guild ID is taken — pick another.');
        return;
      }
      setError('Add a guild name and an ID with at least 3 characters.');
      return;
    }

    if (name.trim().length > GUILD_MAX_NAME_LENGTH) {
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

    setPending(true);
    try {
      const { client } = await getClient();
      const response = await client.groups.create(groupId, {
        v: 1,
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate: accessGated,
        memberDriven,
        topics: normalizeGuildEditorTags(tags),
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
      setTxResult({
        type: 'error',
        msg: txToastError.guildCreateFailed,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <OsAppScreen
      title="Create guild"
      backFallbackHref="/groups"
      glassChrome
      actions={
        <OsIconAction
          ariaLabel={GUILD_CREATE_HELP_TITLE}
          aria-expanded={helpOpen}
          aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}
        >
          <QuestionMarkCircleFillIcon
            aria-hidden
            className="glass-sheet-close-icon"
          />
        </OsIconAction>
      }
    >
      <form className="guild-create-form" onSubmit={handleSubmit}>
        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              // Name is source of truth — re-link ID after any name edit.
              setSlugTouched(false);
            }}
            placeholder="Builder Room"
            maxLength={GUILD_MAX_NAME_LENGTH}
            disabled={pending}
            className={osFieldBorderedClassName}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Guild ID</span>
          <input
            id={fieldId('id')}
            value={slugTouched ? slug : groupId}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder="builder-room"
            maxLength={40}
            disabled={pending}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-invalid={idAvailability === 'taken'}
            className={`${osFieldBorderedClassName} ${idAvailabilityClass}`}
          />
          <small className={idAvailabilityClass}>
            {entityIdAvailabilityLead(idAvailability)} · public link /groups/
            {groupId || 'builder-room'}
          </small>
        </label>

        <label className="guild-field" htmlFor={fieldId('description')}>
          <span>About</span>
          <textarea
            id={fieldId('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this guild does and who it's for."
            maxLength={GUILD_MAX_DESCRIPTION_LENGTH}
            disabled={pending}
            aria-describedby={fieldId('description-count')}
            className={osFieldBorderedClassName}
          />
          <small id={fieldId('description-count')}>
            {description.length}/{GUILD_MAX_DESCRIPTION_LENGTH}
          </small>
        </label>

        <div className="guild-field">
          <span>Topic</span>
          <GuildTagsEditor
            tags={tags}
            onChange={setTags}
            id={fieldId('tags')}
            disabled={pending}
          />
        </div>

        <div className="guild-field">
          <span>Access</span>
          <div
            className="app-storage-presets"
            role="radiogroup"
            aria-label="Guild access"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!accessGated && !memberDriven}
              className={`os-surface-chip${
                !accessGated && !memberDriven ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => {
                setAccessGated(false);
                setMemberDriven(false);
              }}
            >
              Open
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={accessGated && !memberDriven}
              className={`os-surface-chip${
                accessGated && !memberDriven ? ' is-selected' : ''
              }`}
              disabled={pending}
              onClick={() => {
                setAccessGated(true);
                setMemberDriven(false);
              }}
            >
              Invite only
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={memberDriven}
              className={`os-surface-chip${memberDriven ? ' is-selected' : ''}`}
              disabled={pending}
              onClick={() => {
                setMemberDriven(true);
                setAccessGated(true);
              }}
            >
              Collaborative
            </button>
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
          <OsSheetAction
            type="submit"
            ready={canSubmit}
            pending={pending}
            pendingLabel="Creating…"
            disabled={!canSubmit}
          >
            Create guild
          </OsSheetAction>
        </OsSheetActions>
      </form>
      <InfoDrawer
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={GUILD_CREATE_HELP_TITLE}
        summary={GUILD_CREATE_HELP_SUMMARY}
        detail={GUILD_CREATE_HELP_DETAIL}
      />
    </OsAppScreen>
  );
}
