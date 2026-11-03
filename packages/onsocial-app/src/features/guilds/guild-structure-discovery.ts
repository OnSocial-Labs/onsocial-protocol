import type { PostRow } from '@onsocial/sdk';
import {
  appendCustomGuildSpace,
  commitGuildSpaceEdits,
  GUILD_SPACE_LIBRARY,
  LEGACY_DECISIONS_CHANNEL,
  mergeStructureSpaces,
  toggleGuildSpaceEnabled,
  type GuildSpace,
  type GuildSpacePostPolicy,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';

export interface DiscoveredChannelUsage {
  channelId: string;
  postCount: number;
}

export type StructureChannelSuggestionState = 'missing' | 'disabled';

export interface StructureChannelSuggestion {
  channelId: string;
  postCount: number;
  title: string;
  state: StructureChannelSuggestionState;
}

function normalizeSpaceId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function channelIdFromPostChannel(channel: string): string {
  const normalized = normalizeSpaceId(channel);
  if (channel === LEGACY_DECISIONS_CHANNEL || normalized === 'proposals') {
    return 'decisions';
  }
  return normalized || channel;
}

export function titleFromChannelId(channelId: string): string {
  const library = GUILD_SPACE_LIBRARY.find((space) => space.id === channelId);
  if (library) return library.title;
  return channelId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function aggregateChannelsFromPosts(
  posts: Array<Pick<PostRow, 'channel'>>
): DiscoveredChannelUsage[] {
  const counts = new Map<string, number>();

  for (const post of posts) {
    const raw = post.channel?.trim();
    if (!raw) continue;
    const channelId = channelIdFromPostChannel(raw);
    counts.set(channelId, (counts.get(channelId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([channelId, postCount]) => ({ channelId, postCount }))
    .sort((a, b) => b.postCount - a.postCount || a.channelId.localeCompare(b.channelId));
}

export function guildSpaceForChannelId(channelId: string): GuildSpace {
  const library = GUILD_SPACE_LIBRARY.find((space) => space.id === channelId);
  if (library) {
    return { ...library, enabled: true };
  }

  return {
    id: channelId,
    title: titleFromChannelId(channelId),
    kind: 'discussion',
    enabled: true,
    order: 0,
    audience: 'members',
    postPolicy: 'members',
  };
}

export function structureChannelSuggestions(
  structure: GuildStructureDocument,
  discovered: DiscoveredChannelUsage[]
): StructureChannelSuggestion[] {
  return discovered
    .filter(({ channelId }) => channelId !== 'general')
    .map(({ channelId, postCount }) => {
      const existing = structure.spaces.find((space) => space.id === channelId);
      if (existing?.enabled) return null;
      return {
        channelId,
        postCount,
        title: existing?.title ?? titleFromChannelId(channelId),
        state: existing ? 'disabled' : 'missing',
      } satisfies StructureChannelSuggestion;
    })
    .filter((row): row is StructureChannelSuggestion => row !== null);
}

export function enableOrAddGuildSpace(
  structure: GuildStructureDocument,
  channelId: string
): GuildStructureDocument {
  const existing = structure.spaces.find((space) => space.id === channelId);
  if (existing) {
    return toggleGuildSpaceEnabled(structure, channelId, true);
  }
  return mergeStructureSpaces(structure, guildSpaceForChannelId(channelId));
}

export function enableAllSuggestedSpaces(
  structure: GuildStructureDocument,
  suggestions: StructureChannelSuggestion[]
): GuildStructureDocument {
  return suggestions.reduce(
    (next, suggestion) => enableOrAddGuildSpace(next, suggestion.channelId),
    structure
  );
}

export type GuildRoomCreatePreset =
  | { kind: 'blank' }
  | { kind: 'library'; libraryId: string }
  | { kind: 'suggestion'; channelId: string };

/** Commit a new room from the shared editor — blank, library chip, or discovery chip. */
export function commitGuildRoomCreate(
  structure: GuildStructureDocument,
  input: {
    title: string;
    postPolicy: GuildSpacePostPolicy;
    enabled: boolean;
  },
  preset: GuildRoomCreatePreset = { kind: 'blank' }
):
  | { ok: true; structure: GuildStructureDocument }
  | { ok: false; error: string } {
  if (preset.kind === 'blank') {
    return appendCustomGuildSpace(structure, input);
  }

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Enter a room name.' };

  if (preset.kind === 'library') {
    const library = GUILD_SPACE_LIBRARY.find(
      (space) => space.id === preset.libraryId
    );
    if (!library) return { ok: false, error: 'That room is no longer here.' };
    if (structure.spaces.some((space) => space.id === library.id)) {
      return { ok: false, error: 'A room with this name already exists.' };
    }
    const merged = mergeStructureSpaces(structure, {
      ...library,
      title,
      postPolicy: input.postPolicy,
      enabled: true,
    });
    return {
      ok: true,
      structure: input.enabled
        ? merged
        : toggleGuildSpaceEnabled(merged, library.id, false),
    };
  }

  const existing = structure.spaces.find(
    (space) => space.id === preset.channelId
  );
  if (existing) {
    return commitGuildSpaceEdits(structure, preset.channelId, input);
  }

  const base = guildSpaceForChannelId(preset.channelId);
  if (structure.spaces.some((space) => space.id === base.id)) {
    return { ok: false, error: 'A room with this name already exists.' };
  }
  const merged = mergeStructureSpaces(structure, {
    ...base,
    title,
    postPolicy: input.postPolicy,
    enabled: true,
  });
  return {
    ok: true,
    structure: input.enabled
      ? merged
      : toggleGuildSpaceEnabled(merged, base.id, false),
  };
}
