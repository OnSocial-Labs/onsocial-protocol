export type GuildRoleId =
  | 'owner'
  | 'admin'
  | 'moderator'
  | 'member'
  | 'visitor';

export type GuildSurface = 'page' | 'modal' | 'sheet' | 'inline';

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
  tags: string[];
}

export interface GuildActionMap {
  id: string;
  label: string;
  userValue: string;
  surface: GuildSurface;
  route?: string;
  sdkMethods: string[];
  contractAction: string;
  release: 'MVP' | 'Collaboration' | 'Advanced';
}

export interface GuildPhase {
  id: string;
  title: string;
  summary: string;
  outcomes: string[];
}

export interface GuildStructureTemplate {
  id: string;
  title: string;
  summary: string;
  channel: string;
  kind: 'announcement' | 'resource' | 'task' | 'proposal' | 'discussion';
  audience: 'public' | 'members';
  permissionLevel: 'Owner/Admin' | 'Moderator+' | 'Member';
  userValue: string;
}

export interface GuildPermissionPreset {
  id: string;
  title: string;
  summary: string;
  path: (groupId: string) => string;
  level: 'WRITE' | 'MODERATE' | 'MANAGE';
}

export const GUILD_PRODUCT_COPY = {
  title: 'Guilds',
  subtitle:
    'Collaborative spaces for feeds, membership, roles, and optional member-led governance.',
  internalPrimitive: 'core-contract groups',
} as const;

export const GUILD_BLUEPRINTS: GuildBlueprint[] = [
  {
    id: 'creator-guild',
    name: 'Creator Guild',
    eyebrow: 'Audience to members',
    summary: 'A public home for drops, discussion, and supporter access.',
    description:
      'Best for creators who want a portable member space without turning their audience into a formal DAO on day one.',
    access: 'Open access',
    governance: 'Owner-led',
    members: 'Open join',
    channels: ['announcements', 'drops', 'supporters'],
    tags: ['creator', 'community', 'social'],
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
    tags: ['builders', 'projects', 'work'],
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
    tags: ['governance', 'curation', 'grants'],
  },
];

export const GUILD_ROLES: Array<{
  id: GuildRoleId;
  name: string;
  permission: string;
  description: string;
}> = [
  {
    id: 'owner',
    name: 'Owner',
    permission: 'Full access',
    description:
      'Creates the guild, can transfer ownership, configure privacy, and manage admins.',
  },
  {
    id: 'admin',
    name: 'Admin',
    permission: 'MANAGE',
    description:
      'Manages members, moderators, settings, and lower permission grants.',
  },
  {
    id: 'moderator',
    name: 'Moderator',
    permission: 'MODERATE',
    description:
      'Moderates content and members while keeping admin controls out of reach.',
  },
  {
    id: 'member',
    name: 'Member',
    permission: 'WRITE',
    description:
      'Posts, replies, votes where allowed, and participates in member spaces.',
  },
  {
    id: 'visitor',
    name: 'Visitor',
    permission: 'NONE',
    description: 'Views public guilds and can join or request access.',
  },
];

export const GUILD_ACTIONS: GuildActionMap[] = [
  {
    id: 'create',
    label: 'Create guild',
    userValue:
      'Start a shared space with a name, privacy, tags, and governance mode.',
    surface: 'page',
    route: '/groups/create',
    sdkMethods: ['os.groups.create(groupId, config)'],
    contractAction: 'CreateGroup',
    release: 'MVP',
  },
  {
    id: 'join',
    label: 'Join or request access',
    userValue:
      'Enter open guilds immediately or request access to gated guilds.',
    surface: 'modal',
    sdkMethods: ['os.groups.join(groupId)', 'os.groups.cancelJoin(groupId)'],
    contractAction: 'JoinGroup / CancelJoinRequest',
    release: 'MVP',
  },
  {
    id: 'post',
    label: 'Post to guild feed',
    userValue:
      'Publish updates, resources, tasks, and discussion in a member space.',
    surface: 'inline',
    sdkMethods: [
      'os.groups.post(groupId, post)',
      'os.query.groups.feed({ groupId })',
    ],
    contractAction: 'Set under groups/{groupId}/content',
    release: 'MVP',
  },
  {
    id: 'invite',
    label: 'Invite or approve members',
    userValue:
      'Grow access-gated spaces with owner-led approval or member-led proposals.',
    surface: 'sheet',
    sdkMethods: [
      'os.groups.addMember(groupId, memberId)',
      'os.groups.approveJoin(groupId, requesterId)',
      'os.groups.proposeInviteMember(groupId, targetUser)',
    ],
    contractAction: 'AddGroupMember / ApproveJoinRequest / CreateProposal',
    release: 'Collaboration',
  },
  {
    id: 'role',
    label: 'Change role',
    userValue:
      'Promote admins, moderators, and writers without exposing protocol DAO roles.',
    surface: 'sheet',
    sdkMethods: [
      'os.permissions.grantOrPropose(memberId, path, level)',
      'os.groups.proposePermissionChange(groupId, args)',
    ],
    contractAction: 'SetPermission / CreateProposal',
    release: 'Collaboration',
  },
  {
    id: 'vote',
    label: 'Vote on guild proposal',
    userValue:
      'Let members decide invites, role changes, moderation, and custom calls.',
    surface: 'modal',
    sdkMethods: [
      'os.groups.propose(groupId, type, changes)',
      'os.groups.vote(groupId, proposalId, approve)',
    ],
    contractAction: 'CreateProposal / VoteOnProposal',
    release: 'Collaboration',
  },
  {
    id: 'leave',
    label: 'Leave guild',
    userValue: 'Step out of a member space while preserving the guild history.',
    surface: 'modal',
    sdkMethods: ['os.groups.leave(groupId)'],
    contractAction: 'LeaveGroup',
    release: 'MVP',
  },
];

export const GUILD_PHASES: GuildPhase[] = [
  {
    id: 'mvp',
    title: 'MVP',
    summary: 'Make Guilds feel like a real app destination.',
    outcomes: [
      'Guild discovery, detail pages, creation, joining, roster preview, and feed shell.',
      'Simple owner/admin/mod/member roles with permission-gated actions.',
      'Global transaction feedback for on-chain guild writes.',
    ],
  },
  {
    id: 'collaboration',
    title: 'Collaboration depth',
    summary: 'Turn guilds into places where members coordinate.',
    outcomes: [
      'Channels and feed filters backed by group feed metadata.',
      'Invites, request inboxes, notifications, role changes, and member-driven proposals.',
      'Portfolio guild stats and membership sections.',
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced identity',
    summary: 'Make guilds portable social infrastructure.',
    outcomes: [
      'Guild templates for creators, projects, access-gated teams, and review circles.',
      'Public guild identity pages with share cards and profile credentials.',
      'Optional rewards or treasury integrations after the social loop works.',
    ],
  },
];

export const GUILD_STRUCTURE_TEMPLATES: GuildStructureTemplate[] = [
  {
    id: 'announcements',
    title: 'Announcements',
    summary: 'Official updates, drops, releases, and decisions.',
    channel: 'announcements',
    kind: 'announcement',
    audience: 'public',
    permissionLevel: 'Moderator+',
    userValue: 'Gives the guild a clear source of truth.',
  },
  {
    id: 'resources',
    title: 'Resources',
    summary: 'Pinned links, briefs, docs, guides, and shared references.',
    channel: 'resources',
    kind: 'resource',
    audience: 'members',
    permissionLevel: 'Member',
    userValue: 'Turns the guild into a reusable knowledge base.',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    summary: 'Requests, work items, bounties, and coordination threads.',
    channel: 'tasks',
    kind: 'task',
    audience: 'members',
    permissionLevel: 'Member',
    userValue: 'Helps members coordinate instead of only chatting.',
  },
  {
    id: 'proposals',
    title: 'Proposals',
    summary: 'Ideas that need feedback, votes, or owner/admin approval.',
    channel: 'proposals',
    kind: 'proposal',
    audience: 'members',
    permissionLevel: 'Member',
    userValue: 'Creates a path from discussion to decisions.',
  },
  {
    id: 'general',
    title: 'General',
    summary: 'Everyday member discussion and lightweight updates.',
    channel: 'general',
    kind: 'discussion',
    audience: 'members',
    permissionLevel: 'Member',
    userValue: 'Keeps the guild alive between bigger decisions.',
  },
];

export const DEFAULT_GUILD_STRUCTURE: GuildStructureTemplate =
  GUILD_STRUCTURE_TEMPLATES[0] ?? {
    id: 'general',
    title: 'General',
    summary: 'Everyday member discussion and lightweight updates.',
    channel: 'general',
    kind: 'discussion',
    audience: 'members',
    permissionLevel: 'Member',
    userValue: 'Keeps the guild alive between bigger decisions.',
  };

export const GUILD_PERMISSION_PRESETS: GuildPermissionPreset[] = [
  {
    id: 'post',
    title: 'Post in guild',
    summary: 'Create posts, resources, tasks, and proposal discussions.',
    path: (groupId) => `groups/${groupId}/content`,
    level: 'WRITE',
  },
  {
    id: 'moderate',
    title: 'Moderate content',
    summary: 'Keep channels useful and remove low-quality or unsafe posts.',
    path: (groupId) => `groups/${groupId}/content`,
    level: 'MODERATE',
  },
  {
    id: 'manage-members',
    title: 'Manage members',
    summary: 'Approve requests, invite contributors, and update roles.',
    path: (groupId) => `groups/${groupId}/members`,
    level: 'MANAGE',
  },
  {
    id: 'manage-structure',
    title: 'Manage structure',
    summary: 'Adjust guild sections, channels, and participation rules.',
    path: (groupId) => `groups/${groupId}/settings`,
    level: 'MANAGE',
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
      tags: ['guild', 'onsocial'],
    }
  );
}

export function guildPath(groupId: string): string {
  return `/groups/${encodeURIComponent(groupId)}`;
}

export function guildSectionPath(groupId: string, section: string): string {
  return `${guildPath(groupId)}/${section}`;
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
