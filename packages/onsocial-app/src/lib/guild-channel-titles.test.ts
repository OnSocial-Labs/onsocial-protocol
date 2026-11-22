import { beforeEach, describe, expect, it } from 'vitest';
import * as guildChannelTitlesApi from './guild-channel-titles';
import {
  clearGuildChannelTitles,
  guildChannelTitlesForGroup,
  peekGuildChannelTitle,
  seedGuildChannelTitles,
} from './guild-channel-titles';

describe('guild channel titles', () => {
  beforeEach(() => {
    clearGuildChannelTitles();
  });

  it('seeds and peeks a room title for a guild', () => {
    seedGuildChannelTitles('social.guild', {
      general: 'General',
      decisions: 'Decisions',
    });
    expect(peekGuildChannelTitle('social.guild', 'general')).toBe('General');
    expect(guildChannelTitlesForGroup('social.guild')).toEqual({
      general: 'General',
      decisions: 'Decisions',
    });
    expect(peekGuildChannelTitle('other.guild', 'general')).toBeUndefined();
  });

  it('evicts the oldest room title past the cap', () => {
    const published = (
      guildChannelTitlesApi as { GUILD_CHANNEL_TITLE_CACHE_MAX?: number }
    ).GUILD_CHANNEL_TITLE_CACHE_MAX;
    const max = published ?? 200;
    if (published !== undefined) expect(published).toBe(200);

    for (let i = 0; i < max + 1; i += 1) {
      seedGuildChannelTitles(`g${i}.guild`, { room: `Room ${i}` });
    }
    expect(peekGuildChannelTitle('g0.guild', 'room')).toBeUndefined();
    expect(peekGuildChannelTitle(`g${max}.guild`, 'room')).toBe(`Room ${max}`);
  });

  it('refreshes LRU on peek so a hot title survives', () => {
    const published = (
      guildChannelTitlesApi as { GUILD_CHANNEL_TITLE_CACHE_MAX?: number }
    ).GUILD_CHANNEL_TITLE_CACHE_MAX;
    const max = published ?? 200;
    seedGuildChannelTitles('hot.guild', { room: 'Hot' });
    for (let i = 0; i < max; i += 1) {
      expect(peekGuildChannelTitle('hot.guild', 'room')).toBe('Hot');
      seedGuildChannelTitles(`c${i}.guild`, { room: `Cold ${i}` });
    }
    expect(peekGuildChannelTitle('hot.guild', 'room')).toBe('Hot');
    expect(peekGuildChannelTitle('c0.guild', 'room')).toBeUndefined();
  });
});
