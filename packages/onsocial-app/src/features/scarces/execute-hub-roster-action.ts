import type { OnSocial } from '@onsocial/sdk';
import type { HubRosterRowActionId } from '@/features/scarces/hub-roster-row-actions';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';

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
      const response = await apps.makeModerator(appId, accountId);
      return { txHashes: collectRelayTxHashes(response) };
    }
    case 'make-creator': {
      const response = await apps.makeApprovedCreator(appId, accountId);
      return { txHashes: collectRelayTxHashes(response) };
    }
    default:
      throw new Error(`Unsupported hub roster action: ${actionId}`);
  }
}
