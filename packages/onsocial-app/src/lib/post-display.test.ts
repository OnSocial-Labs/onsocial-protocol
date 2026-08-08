import { describe, expect, it } from 'vitest';
import {
  formatPostTimestamp,
  formatRelativePostTimestamp,
  parseDropPaintSnapshot,
  parsePostCollectionEmbed,
  parsePostText,
  postFeedPreviewLimit,
  postPreviewNeedsExpand,
  postTimestampIso,
  POST_FEED_PREVIEW_CHARS,
  POST_FEED_PREVIEW_CHARS_WITH_MEDIA,
  POST_QUOTE_PREVIEW_CHARS,
  POST_TEXT_MAX_LENGTH,
  truncatePostPreview,
} from './post-display';

describe('parsePostCollectionEmbed', () => {
  it('reads collection embeds from schema v1 bodies', () => {
    expect(
      parsePostCollectionEmbed(
        JSON.stringify({
          v: 1,
          text: 'my drop',
          embeds: [
            {
              kind: 'collection',
              chain: 'near',
              contract: 'scarces.onsocial.testnet',
              collectionId: 'drop-1',
              tokenId: 'drop-1:3',
            },
          ],
        })
      )
    ).toEqual({
      kind: 'collection',
      chain: 'near',
      contract: 'scarces.onsocial.testnet',
      collectionId: 'drop-1',
      tokenId: 'drop-1:3',
    });
  });

  it('returns null when collectionId is missing', () => {
    expect(
      parsePostCollectionEmbed(
        JSON.stringify({
          v: 1,
          text: 'x',
          embeds: [
            {
              kind: 'collection',
              chain: 'near',
              contract: 'scarces.onsocial.testnet',
            },
          ],
        })
      )
    ).toBeNull();
  });
});

describe('parseDropPaintSnapshot', () => {
  it('reads x.onsocial.drop paint fields', () => {
    expect(
      parseDropPaintSnapshot(
        JSON.stringify({
          v: 1,
          text: '',
          x: {
            onsocial: {
              drop: {
                collectionId: 'drop-1',
                title: 'Night',
                mediaUrl: 'https://ipfs.io/ipfs/bafy',
                mediumKind: 'audio',
              },
            },
          },
        })
      )
    ).toEqual({
      collectionId: 'drop-1',
      title: 'Night',
      mediaUrl: 'https://ipfs.io/ipfs/bafy',
      mediumKind: 'audio',
    });
  });
});

describe('parsePostText', () => {
  it('reads text from schema v1 post bodies', () => {
    expect(parsePostText(JSON.stringify({ v: 1, text: 'hello world' }))).toBe(
      'hello world'
    );
  });

  it('falls back to raw value when not JSON', () => {
    expect(parsePostText('plain post')).toBe('plain post');
  });
});

describe('post text preview', () => {
  it('exposes feed / quote / compose caps', () => {
    expect(POST_TEXT_MAX_LENGTH).toBe(4000);
    expect(POST_FEED_PREVIEW_CHARS).toBe(280);
    expect(POST_FEED_PREVIEW_CHARS_WITH_MEDIA).toBe(140);
    expect(POST_QUOTE_PREVIEW_CHARS).toBe(120);
    expect(postFeedPreviewLimit(false)).toBe(280);
    expect(postFeedPreviewLimit(true)).toBe(140);
  });

  it('truncates with ellipsis and detects expand need', () => {
    expect(truncatePostPreview('short', 280)).toBe('short');
    expect(truncatePostPreview('a'.repeat(200), 120).endsWith('…')).toBe(true);
    expect(truncatePostPreview('a'.repeat(200), 120).length).toBe(121);
    expect(postPreviewNeedsExpand('a'.repeat(140), 140)).toBe(false);
    expect(postPreviewNeedsExpand('a'.repeat(141), 140)).toBe(true);
  });
});

describe('post timestamps', () => {
  it('formats valid second, millisecond, microsecond, and nanosecond timestamps', () => {
    const expected = new Date(1_783_220_970_000).toISOString();

    expect(postTimestampIso(1_783_220_970)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000_000)).toBe(expected);
    expect(postTimestampIso(1_783_220_970_000_000_000)).toBe(expected);
  });

  it('formats numeric timestamp strings from GraphQL bigint values', () => {
    expect(postTimestampIso('1783220970000000000')).toBe(
      new Date(1_783_220_970_000).toISOString()
    );
  });

  it('does not produce invalid ISO strings for missing timestamps', () => {
    expect(postTimestampIso(0)).toBeUndefined();
    expect(postTimestampIso(Number.NaN)).toBeUndefined();
    expect(formatPostTimestamp(0)).toBe('Unknown time');
  });
});

describe('formatRelativePostTimestamp', () => {
  const now = new Date('2026-07-07T12:00:00Z');

  it('formats sub-minute ages as now', () => {
    expect(formatRelativePostTimestamp(now.getTime() - 30_000, now)).toBe(
      'now'
    );
  });

  it('formats minute, hour, and day ages compactly', () => {
    expect(formatRelativePostTimestamp(now.getTime() - 5 * 60_000, now)).toBe(
      '5m'
    );
    expect(
      formatRelativePostTimestamp(now.getTime() - 2 * 3_600_000, now)
    ).toBe('2h');
    expect(
      formatRelativePostTimestamp(now.getTime() - 3 * 86_400_000, now)
    ).toBe('3d');
  });

  it('falls back to a short date after a week', () => {
    const formatted = formatRelativePostTimestamp(
      now.getTime() - 30 * 86_400_000,
      now
    );
    expect(formatted).not.toMatch(/^\d+[mhd]$/);
    expect(formatted).not.toContain('2026');
  });

  it('includes the year for older years', () => {
    const formatted = formatRelativePostTimestamp(
      new Date('2025-03-10T12:00:00Z').getTime(),
      now
    );
    expect(formatted).toContain('2025');
  });

  it('handles nanosecond timestamps and invalid input', () => {
    expect(
      formatRelativePostTimestamp(
        (now.getTime() - 2 * 3_600_000) * 1_000_000,
        now
      )
    ).toBe('2h');
    expect(formatRelativePostTimestamp(0, now)).toBe('Unknown time');
  });
});
