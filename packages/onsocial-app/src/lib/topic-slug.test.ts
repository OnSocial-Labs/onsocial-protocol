import { describe, expect, it } from 'vitest';
import {
  normalizeTopicList,
  normalizeTopicSlug,
  topicLabel,
  topicsEqual,
} from '@/lib/topic-slug';

describe('topic-slug', () => {
  it('normalizes slugs like feed hashtags', () => {
    expect(normalizeTopicSlug('#Music')).toBe('music');
    expect(normalizeTopicSlug('live-music')).toBe('live_music');
    expect(normalizeTopicSlug('  Electronic  ')).toBe('electronic');
    expect(normalizeTopicSlug('!!!')).toBeNull();
  });

  it('caps and dedupes lists with primary first', () => {
    expect(
      normalizeTopicList(['Music', '#music', 'art', 'games', 'film'])
    ).toEqual(['music', 'art']);
  });

  it('labels and compares', () => {
    expect(topicLabel('music', [{ id: 'music', label: 'Music' }])).toBe(
      'Music'
    );
    expect(topicLabel('live_music')).toBe('Live Music');
    expect(topicsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(topicsEqual(['a'], ['b'])).toBe(false);
  });
});
