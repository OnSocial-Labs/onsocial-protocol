import { describe, expect, it } from 'vitest';
import { DEFAULT_GUILD_STRUCTURE } from '@/features/guilds/guild-structure';
import {
  aggregateChannelsFromPosts,
  channelIdFromPostChannel,
  enableOrAddGuildSpace,
  structureChannelSuggestions,
} from '@/features/guilds/guild-structure-discovery';

describe('guild-structure-discovery', () => {
  it('normalizes legacy proposals channel to decisions', () => {
    expect(channelIdFromPostChannel('proposals')).toBe('decisions');
  });

  it('aggregates channels from posts', () => {
    expect(
      aggregateChannelsFromPosts([
        { channel: 'announcements' },
        { channel: 'announcements' },
        { channel: 'general' },
        { channel: 'proposals' },
      ])
    ).toEqual(
      expect.arrayContaining([
        { channelId: 'announcements', postCount: 2 },
        { channelId: 'general', postCount: 1 },
        { channelId: 'decisions', postCount: 1 },
      ])
    );
  });

  it('suggests missing and disabled channels but not enabled ones', () => {
    const structure = {
      ...DEFAULT_GUILD_STRUCTURE,
      spaces: [
        ...DEFAULT_GUILD_STRUCTURE.spaces,
        {
          id: 'announcements',
          title: 'Announcements',
          kind: 'announcement' as const,
          enabled: false,
          order: 1,
          audience: 'public' as const,
          postPolicy: 'moderators' as const,
        },
      ],
    };

    const suggestions = structureChannelSuggestions(structure, [
      { channelId: 'announcements', postCount: 4 },
      { channelId: 'resources', postCount: 2 },
      { channelId: 'general', postCount: 10 },
    ]);

    expect(suggestions).toEqual([
      {
        channelId: 'announcements',
        postCount: 4,
        title: 'Announcements',
        state: 'disabled',
      },
      {
        channelId: 'resources',
        postCount: 2,
        title: 'Resources',
        state: 'missing',
      },
    ]);
  });

  it('enables existing spaces or adds library matches', () => {
    const withAnnouncements = enableOrAddGuildSpace(
      DEFAULT_GUILD_STRUCTURE,
      'announcements'
    );
    expect(
      withAnnouncements.spaces.find((space) => space.id === 'announcements')
        ?.enabled
    ).toBe(true);

    const withCustom = enableOrAddGuildSpace(
      DEFAULT_GUILD_STRUCTURE,
      'ship-room'
    );
    expect(
      withCustom.spaces.find((space) => space.id === 'ship-room')?.title
    ).toBe('Ship Room');
  });
});
