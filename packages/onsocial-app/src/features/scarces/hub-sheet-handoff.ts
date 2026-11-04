import type { HubManageSheetId } from '@/features/scarces/hub-manage-sheets';

/**
 * Hug successors replace Settings via handoff (transfer / publish inbox).
 * Look / access are slide-overs — Settings crossfades out first, then the
 * slide-over opens after Settings has closed. Roster edits live on Creators.
 */
export function hubSettingsHandoffIsReplace(id: HubManageSheetId): boolean {
  return id === 'publish-requests' || id === 'transfer';
}
