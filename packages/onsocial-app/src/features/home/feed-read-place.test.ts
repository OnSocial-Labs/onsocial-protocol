import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  feedReadLateResultApplies,
  feedReadResumeDue,
  readPlaceHref,
} from './feed-read-face';

const here = dirname(fileURLToPath(import.meta.url));

describe('feed read place', () => {
  it('keeps a feed Read on the page that opened it', () => {
    expect(
      readPlaceHref({ historyHref: '/home?lens=global', collectionId: '' })
    ).toBe('/home?lens=global');
    expect(
      readPlaceHref({
        historyHref: '/@alice.near/writing',
        collectionId: '',
      })
    ).toBe('/@alice.near/writing');
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
    expect(home).toContain('feedSession={columnSession}');
    const screen = readFileSync(
      join(here, '../../components/app/os-app-screen.tsx'),
      'utf8'
    );
    expect(screen).toContain('data-feed-session={feedSession ?? undefined}');
    expect(layer).toContain('FeedReadLayerScreen');
    expect(layer).toContain('entry.feed');
    expect(layer).toContain('WritingReadSheet');
    expect(layer).toContain('openFeedRead');
    expect(layer).toContain(
      'if (profileHop || stack.length === 0 || pathname !== underlayPath) return;'
    );
    expect(card).toContain('openFeedRead');
    expect(card).toContain('publishFeedReadBridge');
    expect(card).toContain('feedReadResumeDue');
    expect(card).toContain('feedReadLateResultApplies');
  });

  it('resumes a drop-backed shell only while that reader is open', () => {
    expect(
      feedReadResumeDue({
        articleOpen: false,
        feedReadLive: true,
        awaitingMeta: true,
      })
    ).toBe(true);
    expect(
      feedReadResumeDue({
        articleOpen: true,
        feedReadLive: false,
        awaitingMeta: true,
      })
    ).toBe(true);
    expect(
      feedReadResumeDue({
        articleOpen: false,
        feedReadLive: false,
        awaitingMeta: true,
      })
    ).toBe(false);
  });

  it('drops a late essay once the stack reader has closed', () => {
    expect(
      feedReadLateResultApplies({
        ticket: 1,
        currentTicket: 1,
        stackOwned: true,
        openKey: 'alice.testnet:1',
        postKey: 'alice.testnet:1',
      })
    ).toBe(true);
    expect(
      feedReadLateResultApplies({
        ticket: 1,
        currentTicket: 1,
        stackOwned: true,
        openKey: null,
        postKey: 'alice.testnet:1',
      })
    ).toBe(false);
    expect(
      feedReadLateResultApplies({
        ticket: 1,
        currentTicket: 2,
        stackOwned: false,
        openKey: null,
        postKey: 'alice.testnet:1',
      })
    ).toBe(false);
    expect(
      feedReadLateResultApplies({
        ticket: 1,
        currentTicket: 1,
        stackOwned: false,
        openKey: null,
        postKey: 'alice.testnet:1',
      })
    ).toBe(true);
  });
});
