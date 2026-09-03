import { describe, expect, it } from 'vitest';
import {
  profileIdentityTopicLabel,
  profileIdentityTopics,
} from '@/lib/profile-identity-topics';

describe('profileIdentityTopics', () => {
  it('normalizes slugs and strips a leading hash', () => {
    expect(profileIdentityTopics([' #Design ', 'writing'])).toEqual([
      'design',
      'writing',
    ]);
  });

  it('caps at eight and drops empties', () => {
    const tags = Array.from({ length: 10 }, (_, index) => `topic${index}`);
    expect(profileIdentityTopics(tags)).toHaveLength(8);
    expect(profileIdentityTopics(['', '  '])).toEqual([]);
  });
});

describe('profileIdentityTopicLabel', () => {
  it('shows sentence case without a hash', () => {
    expect(profileIdentityTopicLabel('design')).toBe('Design');
    expect(profileIdentityTopicLabel('live_music')).toBe('Live music');
  });
});
