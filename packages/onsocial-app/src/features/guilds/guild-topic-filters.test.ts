import { describe, expect, it } from 'vitest';
import {
  GUILD_TOPIC_FILTERS,
  GUILD_TOPIC_SUGGESTIONS,
  guildTopicLabel,
} from '@/features/guilds/guild-config';

describe('guild topic discover filters', () => {
  it('starts with All then suggested topics', () => {
    expect(GUILD_TOPIC_FILTERS[0]).toEqual({ id: 'all', label: 'All' });
    expect(GUILD_TOPIC_FILTERS.length).toBe(GUILD_TOPIC_SUGGESTIONS.length + 1);
  });

  it('labels known and custom guild topic slugs', () => {
    expect(guildTopicLabel('music')).toBe('Music');
    expect(guildTopicLabel('crypto')).toBe('Crypto');
    expect(guildTopicLabel('live_music')).toBe('Live music');
  });
});
