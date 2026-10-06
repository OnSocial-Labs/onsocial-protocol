export interface GuildBlueprint {
  id: string;
  name: string;
  eyebrow: string;
  summary: string;
  description: string;
  access: 'Open access' | 'Access-gated';
  governance: 'Owner-led' | 'Collaborative';
  members: string;
  channels: string[];
  topics: string[];
}

export const GUILD_PRODUCT_COPY = {
  title: 'Guilds',
  subtitle:
    'Collaborative guilds for feeds, membership, roles, and optional member-led governance.',
  internalPrimitive: 'core-contract groups',
} as const;

export const GUILD_BLUEPRINTS: GuildBlueprint[] = [
  {
    id: 'creator-guild',
    name: 'Creator Guild',
    eyebrow: 'Audience to members',
    summary: 'A public home for drops, discussion, and supporter access.',
    description:
      'Best for creators who want a portable member guild without turning their audience into a formal DAO on day one.',
    access: 'Open access',
    governance: 'Owner-led',
    members: 'Open join',
    channels: ['announcements', 'drops', 'supporters'],
    topics: ['creator', 'community', 'social'],
  },
  {
    id: 'builder-room',
    name: 'Builder Room',
    eyebrow: 'Project workspace',
    summary: 'An access-gated room for shipping, proposals, and member tasks.',
    description:
      'Best for teams coordinating product work, reviews, resources, and project updates with role-gated posting.',
    access: 'Access-gated',
    governance: 'Collaborative',
    members: 'Request to join',
    channels: ['updates', 'tasks', 'resources'],
    topics: ['builders', 'projects', 'work'],
  },
  {
    id: 'review-circle',
    name: 'Review Circle',
    eyebrow: 'Member-led curation',
    summary: 'A collaborative guild for grants, reviews, and shared decisions.',
    description:
      'Best for groups that need lightweight votes, member invites, moderation, and transparent decision history.',
    access: 'Access-gated',
    governance: 'Collaborative',
    members: 'Invite or proposal',
    channels: ['intake', 'reviews', 'decisions'],
    topics: ['governance', 'curation', 'grants'],
  },
];

export function getGuildBlueprint(groupId: string): GuildBlueprint {
  return (
    GUILD_BLUEPRINTS.find((guild) => guild.id === groupId) ?? {
      id: groupId,
      name: groupId
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      eyebrow: 'Custom guild',
      summary: 'A live OnSocial guild.',
      description:
        'Use this page as the durable home for a guild feed, roster, settings, and collaborative decisions.',
      access: 'Access-gated',
      governance: 'Owner-led',
      members: 'Request to join',
      channels: ['announcements', 'general', 'resources'],
      topics: ['guild', 'onsocial'],
    }
  );
}

export function guildPath(groupId: string): string {
  return `/groups/${encodeURIComponent(groupId)}`;
}

/** Shareable guild sheets opened on the home route (`?sheet=`). */
export type GuildShareSheetId =
  | 'proposals'
  | 'members'
  | 'requests'
  | 'settings';

export type GuildManageShareSheetId = Exclude<GuildShareSheetId, 'settings'>;

export function parseGuildSheetParam(
  raw: string | null | undefined
): GuildShareSheetId | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (
    value === 'proposals' ||
    value === 'members' ||
    value === 'requests' ||
    value === 'settings'
  ) {
    return value;
  }
  return null;
}

export function manageSheetFromShare(
  sheet: GuildShareSheetId | null | undefined
): GuildManageShareSheetId | null {
  if (sheet === 'members' || sheet === 'proposals' || sheet === 'requests') {
    return sheet;
  }
  return null;
}

export function guildSheetPath(
  groupId: string,
  sheet: GuildShareSheetId
): string {
  return `${guildPath(groupId)}?sheet=${sheet}`;
}

export function guildPostPath(
  groupId: string,
  author: string,
  postId: string
): string {
  return `${guildPath(groupId)}/posts/${encodeURIComponent(author)}/${encodeURIComponent(postId)}`;
}

export function normalizeGuildIdInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function collectRelayTxHashes(response: unknown): string[] {
  if (!response || typeof response !== 'object') return [];
  const value = response as Record<string, unknown>;
  const direct = typeof value.txHash === 'string' ? value.txHash : null;
  const hash = typeof value.hash === 'string' ? value.hash : null;
  const rawHashes = collectRelayTxHashes(value.raw);
  return [...new Set([direct, hash, ...rawHashes].filter(Boolean) as string[])];
}
