import type { OnSocial } from '@onsocial/sdk';
import type { HubRosterRowActionId } from '@/features/scarces/hub-roster-row-actions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';

function mergeRelayResponses(...responses: unknown[]): string[] {
  return [
    ...new Set(responses.flatMap((response) => collectRelayTxHashes(response))),
  ];
}

export async function executeHubRosterAction(
  client: OnSocial,
  input: {
    appId: string;
    accountId: string;
    actionId: HubRosterRowActionId;
  }
): Promise<{ txHashes: string[] }> {
  const { appId, accountId, actionId } = input;
  const apps = client.scarces.apps;

  switch (actionId) {
    case 'remove-moderator': {
      const response = await apps.removeModerator(appId, accountId);
      return { txHashes: collectRelayTxHashes(response) };
    }
    case 'remove-creator': {
      const response = await apps.removeApprovedCreator(appId, accountId);
      return { txHashes: collectRelayTxHashes(response) };
    }
    case 'make-moderator': {
      const removed = await apps.removeApprovedCreator(appId, accountId);
      const added = await apps.addModerator(appId, accountId);
      return { txHashes: mergeRelayResponses(removed, added) };
    }
    case 'make-creator': {
      const removed = await apps.removeModerator(appId, accountId);
      const added = await apps.addApprovedCreator(appId, accountId);
      return { txHashes: mergeRelayResponses(removed, added) };
    }
    default:
      throw new Error(`Unsupported hub roster action: ${actionId}`);
  }
}
