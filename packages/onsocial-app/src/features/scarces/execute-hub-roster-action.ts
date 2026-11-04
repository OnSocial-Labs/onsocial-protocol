import type { OnSocial } from '@onsocial/sdk';
import type { HubRosterRowActionId } from '@/features/scarces/hub-roster-row-actions';

export async function executeHubRosterAction(
  client: OnSocial,
  input: {
    appId: string;
    accountId: string;
    actionId: HubRosterRowActionId;
  }
) {
  const { appId, accountId, actionId } = input;
  const apps = client.scarces.apps;

  switch (actionId) {
    case 'remove-moderator':
      return apps.removeModerator(appId, accountId);
    case 'remove-creator':
      return apps.removeApprovedCreator(appId, accountId);
    default:
      throw new Error(`Unsupported hub roster action: ${actionId}`);
  }
}
