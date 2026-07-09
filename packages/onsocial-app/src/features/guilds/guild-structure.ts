export type GuildSpaceKind =
  | 'discussion'
  | 'announcement'
  | 'resource'
  | 'task'
  | 'proposal';

export type GuildSpaceAudience = 'public' | 'members';

export type GuildSpacePostPolicy = 'members' | 'moderators' | 'admins';

export const GUILD_POST_POLICY_OPTIONS: {
  value: GuildSpacePostPolicy;
  label: string;
  hint: string;
}[] = [
  {
    value: 'members',
    label: 'Everyone here',
    hint: 'Any member can share',
  },
  {
    value: 'moderators',
    label: 'From the team',
    hint: 'Mod · admin · owner',
  },
  {
    value: 'admins',
    label: 'Leaders only',
    hint: 'admin · owner',
  },
];

export const GUILD_SPACE_KIND_OPTIONS: {
  value: GuildSpaceKind;
  label: string;
}[] = [
  { value: 'discussion', label: 'Discussion' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'resource', label: 'Resource' },
  { value: 'task', label: 'Task' },
  { value: 'proposal', label: 'Decisions' },
];

export interface GuildSpace {
  id: string;
  title: string;
  kind: GuildSpaceKind;
  enabled: boolean;
  order: number;
  audience: GuildSpaceAudience;
  postPolicy: GuildSpacePostPolicy;
}

export interface GuildStructureDocument {
  v: 1;
  defaultSpaceId: string;
  spaces: GuildSpace[];
}

export interface GuildViewerAccess {
  isMember: boolean;
  canModerate: boolean;
  isAdmin: boolean;
  isOwner: boolean;
}

export const GUILD_SPACE_LIBRARY: GuildSpace[] = [
  {
    id: 'general',
    title: 'General',
    kind: 'discussion',
    enabled: true,
    order: 0,
    audience: 'members',
    postPolicy: 'members',
  },
  {
    id: 'announcements',
    title: 'Announcements',
    kind: 'announcement',
    enabled: false,
    order: 1,
    audience: 'public',
    postPolicy: 'moderators',
  },
  {
    id: 'resources',
    title: 'Resources',
    kind: 'resource',
    enabled: false,
    order: 2,
    audience: 'members',
    postPolicy: 'members',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    kind: 'task',
    enabled: false,
    order: 3,
    audience: 'members',
    postPolicy: 'members',
  },
  {
    id: 'decisions',
    title: 'Decisions',
    kind: 'proposal',
    enabled: false,
    order: 4,
    audience: 'members',
    postPolicy: 'members',
  },
];

/** Legacy posts may still use channel `proposals`. */
export const LEGACY_DECISIONS_CHANNEL = 'proposals';

export const DEFAULT_GUILD_STRUCTURE: GuildStructureDocument = {
  v: 1,
  defaultSpaceId: 'general',
  spaces: [
    {
      id: 'general',
      title: 'General',
      kind: 'discussion',
      enabled: true,
      order: 0,
      audience: 'members',
      postPolicy: 'members',
    },
  ],
};

export const GUILD_STRUCTURE_TEMPLATES: Record<
  string,
  { label: string; structure: GuildStructureDocument }
> = {
  minimal: {
    label: 'Minimal',
    structure: DEFAULT_GUILD_STRUCTURE,
  },
  creator: {
    label: 'Creator',
    structure: {
      v: 1,
      defaultSpaceId: 'general',
      spaces: [
        { ...GUILD_SPACE_LIBRARY[0], enabled: true, order: 0 },
        { ...GUILD_SPACE_LIBRARY[1], enabled: true, order: 1 },
        { ...GUILD_SPACE_LIBRARY[2], enabled: true, order: 2 },
      ],
    },
  },
  builder: {
    label: 'Builder room',
    structure: {
      v: 1,
      defaultSpaceId: 'general',
      spaces: [
        { ...GUILD_SPACE_LIBRARY[0], enabled: true, order: 0 },
        { ...GUILD_SPACE_LIBRARY[1], enabled: true, order: 1 },
        { ...GUILD_SPACE_LIBRARY[2], enabled: true, order: 2 },
        { ...GUILD_SPACE_LIBRARY[3], enabled: true, order: 3 },
      ],
    },
  },
  review: {
    label: 'Review circle',
    structure: {
      v: 1,
      defaultSpaceId: 'general',
      spaces: [
        { ...GUILD_SPACE_LIBRARY[0], enabled: true, order: 0 },
        { ...GUILD_SPACE_LIBRARY[4], enabled: true, order: 1 },
        { ...GUILD_SPACE_LIBRARY[1], enabled: true, order: 2 },
      ],
    },
  },
};

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readSpaceKind(value: unknown): GuildSpaceKind | null {
  const kinds: GuildSpaceKind[] = [
    'discussion',
    'announcement',
    'resource',
    'task',
    'proposal',
  ];
  return kinds.includes(value as GuildSpaceKind)
    ? (value as GuildSpaceKind)
    : null;
}

function readPostPolicy(value: unknown): GuildSpacePostPolicy | null {
  if (value === 'members' || value === 'moderators' || value === 'admins') {
    return value;
  }
  return null;
}

function readAudience(value: unknown): GuildSpaceAudience | null {
  if (value === 'public' || value === 'members') return value;
  return null;
}

function normalizeSpaceId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function parseSpace(raw: unknown, fallbackOrder: number): GuildSpace | null {
  const record = readRecord(raw);
  if (!record) return null;

  const id = normalizeSpaceId(readString(record.id) ?? '');
  const title = readString(record.title);
  const kind = readSpaceKind(record.kind);
  if (!id || !title || !kind) return null;

  return {
    id,
    title,
    kind,
    enabled: readBoolean(record.enabled) || record.enabled === undefined,
    order:
      typeof record.order === 'number' && Number.isFinite(record.order)
        ? record.order
        : fallbackOrder,
    audience: readAudience(record.audience) ?? 'members',
    postPolicy: readPostPolicy(record.postPolicy) ?? 'members',
  };
}

export function cloneGuildStructure(
  structure: GuildStructureDocument
): GuildStructureDocument {
  return {
    v: 1,
    defaultSpaceId: structure.defaultSpaceId,
    spaces: structure.spaces.map((space) => ({ ...space })),
  };
}

export function parseGuildStructure(raw: Record<string, unknown>): GuildStructureDocument {
  const onsocialRecord = readRecord(readRecord(raw.x)?.onsocial);
  const structureRaw =
    readRecord(onsocialRecord?.structure) ?? readRecord(raw.structure);

  if (!structureRaw) {
    return cloneGuildStructure(DEFAULT_GUILD_STRUCTURE);
  }

  const spacesRaw = Array.isArray(structureRaw.spaces) ? structureRaw.spaces : [];
  const spaces = spacesRaw
    .map((entry, index) => parseSpace(entry, index))
    .filter((space): space is GuildSpace => space !== null)
    .sort((a, b) => a.order - b.order);

  if (spaces.length === 0) {
    return cloneGuildStructure(DEFAULT_GUILD_STRUCTURE);
  }

  const defaultSpaceId =
    normalizeSpaceId(readString(structureRaw.defaultSpaceId) ?? '') ||
    spaces.find((space) => space.enabled)?.id ||
    spaces[0]!.id;

  const normalizedDefault = spaces.some((space) => space.id === defaultSpaceId)
    ? defaultSpaceId
    : spaces[0]!.id;

  return {
    v: 1,
    defaultSpaceId: normalizedDefault,
    spaces,
  };
}

export function guildStructureForMetadata(
  structure: GuildStructureDocument
): Record<string, unknown> {
  return {
    v: 1,
    defaultSpaceId: structure.defaultSpaceId,
    spaces: structure.spaces.map((space) => ({ ...space })),
  };
}

export function guildStructureMetadataPatch(
  structure: GuildStructureDocument
): Record<string, unknown> {
  return {
    x: {
      onsocial: {
        structure: guildStructureForMetadata(structure),
      },
    },
  };
}

export function guildStructuresEqual(
  a: GuildStructureDocument,
  b: GuildStructureDocument
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function enabledGuildSpaces(
  structure: GuildStructureDocument
): GuildSpace[] {
  return structure.spaces
    .filter((space) => space.enabled)
    .sort((a, b) => a.order - b.order);
}

export function guildSpaceById(
  structure: GuildStructureDocument,
  spaceId: string
): GuildSpace | null {
  return structure.spaces.find((space) => space.id === spaceId) ?? null;
}

export function defaultComposerSpace(
  structure: GuildStructureDocument,
  viewer: GuildViewerAccess
): GuildSpace {
  const postable = composerGuildSpaces(structure, viewer);
  const preferred = postable.find(
    (space) => space.id === structure.defaultSpaceId
  );
  return preferred ?? postable[0] ?? structure.spaces[0]!;
}

export function canPostToGuildSpace(
  space: GuildSpace,
  viewer: GuildViewerAccess
): boolean {
  if (!viewer.isMember) return false;
  if (space.postPolicy === 'members') return true;
  if (space.postPolicy === 'moderators') {
    return viewer.canModerate || viewer.isAdmin || viewer.isOwner;
  }
  return viewer.isAdmin || viewer.isOwner;
}

export function composerGuildSpaces(
  structure: GuildStructureDocument,
  viewer: GuildViewerAccess
): GuildSpace[] {
  return enabledGuildSpaces(structure).filter((space) =>
    canPostToGuildSpace(space, viewer)
  );
}

export function guildSpaceFeedChannel(space: GuildSpace): string {
  if (space.id === 'decisions') return LEGACY_DECISIONS_CHANNEL;
  return space.id;
}

export function guildSpaceMatchesPostChannel(
  space: GuildSpace,
  channel: string | null | undefined
): boolean {
  if (!channel) return false;
  if (channel === space.id) return true;
  return space.id === 'decisions' && channel === LEGACY_DECISIONS_CHANNEL;
}

export function guildSpaceContentPath(groupId: string, spaceId: string): string {
  return `groups/${groupId}/content/${spaceId}/`;
}

export function postPolicyLabel(policy: GuildSpacePostPolicy): string {
  return (
    GUILD_POST_POLICY_OPTIONS.find((option) => option.value === policy)?.label ??
    policy
  );
}

export function postPolicyHint(policy: GuildSpacePostPolicy): string {
  return (
    GUILD_POST_POLICY_OPTIONS.find((option) => option.value === policy)?.hint ??
    ''
  );
}

export function resolveSpaceForPostChannel(
  structure: GuildStructureDocument,
  channel: string | null | undefined
): GuildSpace | null {
  if (!channel) {
    return guildSpaceById(structure, structure.defaultSpaceId);
  }
  for (const space of structure.spaces) {
    if (guildSpaceMatchesPostChannel(space, channel)) {
      return space;
    }
  }
  return null;
}

export function canViewerPostInChannel(
  structure: GuildStructureDocument,
  channel: string | null | undefined,
  viewer: GuildViewerAccess
): boolean {
  const space = resolveSpaceForPostChannel(structure, channel);
  if (!space) return viewer.isMember;
  return canPostToGuildSpace(space, viewer);
}

export function normalizeCustomSpaceInput(input: {
  title: string;
  kind: GuildSpaceKind;
  postPolicy: GuildSpacePostPolicy;
  audience: GuildSpaceAudience;
}): GuildSpace | null {
  const title = input.title.trim();
  const id = normalizeSpaceId(title);
  if (!title || !id) return null;

  return {
    id,
    title,
    kind: input.kind,
    enabled: true,
    order: 0,
    audience: input.audience,
    postPolicy: input.postPolicy,
  };
}

export function mergeStructureSpaces(
  structure: GuildStructureDocument,
  incoming: GuildSpace
): GuildStructureDocument {
  if (structure.spaces.some((space) => space.id === incoming.id)) {
    return structure;
  }
  const nextOrder =
    structure.spaces.reduce((max, space) => Math.max(max, space.order), -1) + 1;
  return {
    ...structure,
    spaces: [
      ...structure.spaces,
      { ...incoming, order: nextOrder, enabled: true },
    ],
  };
}

export function toggleGuildSpaceEnabled(
  structure: GuildStructureDocument,
  spaceId: string,
  enabled: boolean
): GuildStructureDocument {
  return {
    ...structure,
    spaces: structure.spaces.map((space) =>
      space.id === spaceId ? { ...space, enabled } : space
    ),
  };
}

export function reorderGuildSpace(
  structure: GuildStructureDocument,
  spaceId: string,
  direction: 'up' | 'down'
): GuildStructureDocument {
  const spaces = [...structure.spaces].sort((a, b) => a.order - b.order);
  const index = spaces.findIndex((space) => space.id === spaceId);
  if (index < 0) return structure;

  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= spaces.length) return structure;

  const current = spaces[index]!;
  const swap = spaces[swapIndex]!;
  spaces[index] = { ...swap, order: current.order };
  spaces[swapIndex] = { ...current, order: swap.order };

  return {
    ...structure,
    spaces: spaces.sort((a, b) => a.order - b.order),
  };
}

export function updateGuildSpaceTitle(
  structure: GuildStructureDocument,
  spaceId: string,
  title: string
): GuildStructureDocument {
  return {
    ...structure,
    spaces: structure.spaces.map((space) =>
      space.id === spaceId ? { ...space, title } : space
    ),
  };
}

export function librarySpacesNotInStructure(
  structure: GuildStructureDocument
): GuildSpace[] {
  const existing = new Set(structure.spaces.map((space) => space.id));
  return GUILD_SPACE_LIBRARY.filter((space) => !existing.has(space.id));
}
