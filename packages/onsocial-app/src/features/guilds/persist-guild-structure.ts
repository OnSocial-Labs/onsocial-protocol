import type { OnSocial } from '@onsocial/sdk';
import { mergeGuildOnsocialMetadataPatch } from '@/features/guilds/guild-config';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  guildStructureForMetadata,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';

interface TrackGuildStructureInput {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
}

/**
 * Persist guild structure metadata on chain.
 *
 * Post policy is enforced on-chain for `content/post/*` writes using structure
 * metadata and post `channel`. Join still grants member WRITE on
 * `groups/{id}/content/`; restricted spaces add role or
 * `groups/{id}/spaces/{spaceId}/write` checks.
 *
 * Merges into existing `x.onsocial` so banner/avatar extras survive room edits.
 */
export async function persistGuildStructure(
  client: OnSocial,
  groupId: string,
  memberDriven: boolean,
  structure: GuildStructureDocument,
  trackTransaction: (input: TrackGuildStructureInput) => Promise<boolean>
): Promise<boolean> {
  const existing = await client.groups.getConfig(groupId);
  const changes = mergeGuildOnsocialMetadataPatch(existing, {
    structure: guildStructureForMetadata(structure),
  });
  const response = memberDriven
    ? await client.groups.proposeMetadataUpdate(groupId, changes, {
        reason: 'Guild rooms update',
        autoVote: true,
      })
    : await client.groups.updateMetadata(groupId, changes);

  return trackTransaction({
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
