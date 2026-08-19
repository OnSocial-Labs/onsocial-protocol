import { describe, expect, it } from 'vitest';
import {
  normalizeTopicList,
  normalizeTopicSlug,
  topicLabel,
  topicsEqual,
  formatTopicDraftInput,
  discoverTopicFiltersFromCounts,
  countPrimaryTopics,
  TOPIC_MAX_LENGTH,
} from '@/lib/topic-slug';

describe('topic-slug', () => {
  it('normalizes slugs like feed hashtags', () => {
    expect(normalizeTopicSlug('#Music')).toBe('music');
    expect(normalizeTopicSlug('live-music')).toBe('live_music');
    expect(normalizeTopicSlug('  Electronic  ')).toBe('electronic');
    expect(normalizeTopicSlug('!!!')).toBeNull();
  });

  it('formats draft input as first capital, rest lower, capped', () => {
    expect(formatTopicDraftInput('mUSIC')).toBe('Music');
    expect(formatTopicDraftInput('live MUSIC')).toBe('Live music');
    expect(formatTopicDraftInput('a'.repeat(40)).length).toBe(TOPIC_MAX_LENGTH);
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

  it('builds Discover chips from used topics including custom', () => {
    const counts = countPrimaryTopics([
      { topic: 'music' },
      { topic: 'music' },
      { topic: 'podcasts' },
      { topic: null },
    ]);
    expect(
      discoverTopicFiltersFromCounts(counts, [
        { id: 'music', label: 'Music' },
      ])
    ).toEqual([
      { id: 'all', label: 'All' },
      { id: 'music', label: 'Music' },
      { id: 'podcasts', label: 'Podcasts' },
    ]);
  });
});
