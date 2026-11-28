import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readPlaceHref } from './feed-read-face';

const here = dirname(fileURLToPath(import.meta.url));

describe('feed read place', () => {
  it('keeps a feed Read on the page that opened it', () => {
    expect(
      readPlaceHref({ historyHref: '/home?lens=global', collectionId: '' })
    ).toBe('/home?lens=global');
    expect(
      readPlaceHref({ historyHref: null, collectionId: 'night-essay' })
    ).toBe('/collection/night-essay');
  });

  it('covers the home column from place depth and paints the feed reader on the stack', () => {
    const home = readFileSync(join(here, 'home-feed.tsx'), 'utf8');
    const layer = readFileSync(join(here, 'post-thread-layer.tsx'), 'utf8');
    const card = readFileSync(join(here, 'post-card.tsx'), 'utf8');

    expect(home).toContain('usePlaceDepth');
    expect(home).toContain('feedColumnSession(placeDepth)');
    expect(home).toContain("'data-feed-session': columnSession");
    expect(layer).toContain('FeedReadLayerScreen');
    expect(layer).toContain('entry.feed');
    expect(layer).toContain('WritingReadSheet');
    expect(layer).toContain('openFeedRead');
    expect(card).toContain('openFeedRead');
    expect(card).toContain('publishFeedReadBridge');
  });
});
