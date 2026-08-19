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
  DISCOVER_CUSTOM_TOPIC_MIN_COUNT,
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

  it('labels customs with the same Sentence case as draft', () => {
    expect(topicLabel('live_music')).toBe('Live music');
    expect(topicLabel('podcasts')).toBe('Podcasts');
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
    expect(topicsEqual(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(topicsEqual(['a'], ['b'])).toBe(false);
  });

  it('omits one-off customs from Discover until min count', () => {
    expect(DISCOVER_CUSTOM_TOPIC_MIN_COUNT).toBe(2);
    const counts = countPrimaryTopics([
      { topic: 'music' },
      { topic: 'podcasts' },
      { topic: 'podcasts' },
      { topic: 'once' },
    ]);
    expect(
      discoverTopicFiltersFromCounts(counts, [
        { id: 'music', label: 'Music' },
      ])
    ).toEqual([
      { id: 'all', label: 'All' },
      { id: 'podcasts', label: 'Podcasts' },
      { id: 'music', label: 'Music' },
    ]);
  });
});
