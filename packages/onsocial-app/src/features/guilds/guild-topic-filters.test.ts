import { describe, expect, it } from 'vitest';
import {
  GUILD_TOPIC_FILTERS,
  guildTopicLabel,
} from '@/features/guilds/guild-config';

describe('guild topic discover filters', () => {
  it('starts with All then suggested topics', () => {
    expect(GUILD_TOPIC_FILTERS[0]).toEqual({ id: 'all', label: 'All' });
    expect(GUILD_TOPIC_FILTERS.length).toBeGreaterThan(1);
  });

  it('labels known guild topic slugs', () => {
    expect(guildTopicLabel('builders')).toBe('Builders');
    expect(guildTopicLabel('near')).toBe('NEAR');
  });
});
