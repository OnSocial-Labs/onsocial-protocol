import type { OnSocial } from '@onsocial/sdk';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import {
  guildStructureMetadataPatch,
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
 * Post policy is enforced in the app against `channel` metadata. On-chain
 * writes still land under `groups/{id}/content/post/{postId}` with member
 * WRITE on `groups/{id}/content/` — per-space path grants would not gate
 * channel choice until post paths or contract checks align with spaces.
 */
export async function persistGuildStructure(
  client: OnSocial,
  groupId: string,
  memberDriven: boolean,
  structure: GuildStructureDocument,
  trackTransaction: (input: TrackGuildStructureInput) => Promise<boolean>
): Promise<boolean> {
  const changes = guildStructureMetadataPatch(structure);
  const response = memberDriven
    ? await client.groups.proposeMetadataUpdate(groupId, changes, {
        reason: 'Guild spaces update',
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
