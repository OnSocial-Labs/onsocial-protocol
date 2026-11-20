import { beforeEach, describe, expect, it } from 'vitest';
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
});
