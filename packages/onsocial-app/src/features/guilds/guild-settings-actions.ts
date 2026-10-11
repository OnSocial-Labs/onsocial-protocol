export type GuildSettingsActionId = 'edit' | 'rooms' | 'storage';

export interface GuildSettingsAction {
  id: GuildSettingsActionId;
  label: string;
  description: string;
}

/**
 * Settings rows an owner or admin can complete.
 * Moderators review members from the guild menu; they cannot edit the guild,
 * its rooms, or its storage pool. Unavailable tools stay off this list.
 */
export function guildSettingsActions(
  viewer: { isOwner: boolean; isAdmin: boolean } | null | undefined
): GuildSettingsAction[] {
  if (!viewer?.isOwner && !viewer?.isAdmin) return [];
  return [
    {
      id: 'edit',
      label: 'Edit guild',
      description: 'Banner, name, topics, access',
    },
    {
      id: 'rooms',
      label: 'Rooms',
      description: 'Rooms and feed tabs',
    },
    {
      id: 'storage',
      label: 'Guild storage',
      description: 'Fund the pool and add storage for members',
    },
  ];
}

export function canConfigureGuild(
  viewer: { isOwner: boolean; isAdmin: boolean } | null | undefined
): boolean {
  return guildSettingsActions(viewer).length > 0;
}
