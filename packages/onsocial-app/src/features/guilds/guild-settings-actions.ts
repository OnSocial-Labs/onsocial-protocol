export type GuildSettingsActionId =
  | 'requests'
  | 'proposals'
  | 'edit'
  | 'rooms'
  | 'storage';

export interface GuildSettingsViewer {
  isOwner: boolean;
  isAdmin: boolean;
  isMember?: boolean;
  /** Gated guild, and this viewer can review join requests. */
  canReviewRequests?: boolean;
}

export interface GuildSettingsAction {
  id: GuildSettingsActionId;
  label: string;
  description: string;
}

const CONFIGURE_ACTIONS: GuildSettingsAction[] = [
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

/**
 * Settings rows this viewer can open.
 * Member requests lead on a gated guild for reviewers.
 * Proposals follow, for any member and for owners or admins.
 * Edit, rooms, and storage stay owner and admin only.
 */
export function guildSettingsActions(
  viewer: GuildSettingsViewer | null | undefined
): GuildSettingsAction[] {
  const canConfigure = Boolean(viewer?.isOwner || viewer?.isAdmin);
  const canSeeProposals = Boolean(viewer?.isMember) || canConfigure;
  const rows: GuildSettingsAction[] = [];
  if (viewer?.canReviewRequests) {
    rows.push({
      id: 'requests',
      label: 'Member requests',
      description: 'People waiting to join',
    });
  }
  if (canSeeProposals) {
    rows.push({
      id: 'proposals',
      label: 'Proposals',
      description: 'Governance items for this guild',
    });
  }
  if (canConfigure) rows.push(...CONFIGURE_ACTIONS);
  return rows;
}

/** Owner and admin tools: edit, rooms, storage. */
export function canConfigureGuild(
  viewer: Pick<GuildSettingsViewer, 'isOwner' | 'isAdmin'> | null | undefined
): boolean {
  return Boolean(viewer?.isOwner || viewer?.isAdmin);
}

/** Gear entry: at least one settings row (proposals and/or owner tools). */
export function canOpenGuildSettings(
  viewer: GuildSettingsViewer | null | undefined
): boolean {
  return guildSettingsActions(viewer).length > 0;
}
