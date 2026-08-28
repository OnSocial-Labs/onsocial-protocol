import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomeFeedChipBar } from '@/features/home/home-feed-chip-bar';

describe('HomeFeedChipBar', () => {
  it('composes OsChipRail with lenses, saved remove, and add', () => {
    const html = renderToStaticMarkup(
      createElement(HomeFeedChipBar, {
        lens: 'pulse',
        onLensChange: () => undefined,
        standingAvailable: true,
        savedFeeds: [
          {
            id: 'social',
            kind: 'ticker',
            value: 'social',
            createdAt: 1,
          },
        ],
        activeFocus: { kind: 'ticker', value: 'social' },
        onSelectSavedFeed: () => undefined,
        onRemoveSavedFeed: () => undefined,
        onClearFocus: () => undefined,
        onNewFeed: () => undefined,
      })
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Feed"');
    expect(html).toContain('discover-tab-bar--header');
    expect(html).toContain('>Pulse<');
    expect(html).toContain('>Global<');
    expect(html).toContain('>Saved<');
    expect(html).toContain('discover-tab-bar-chip-cluster is-active');
    expect(html).toContain('aria-label="Remove $SOCIAL"');
    expect(html).toContain('aria-label="Add feed"');
    expect(html).toContain('discover-tab-bar-chip-add');
  });

  it('shows an ephemeral focus chip when the topic is not saved', () => {
    const html = renderToStaticMarkup(
      createElement(HomeFeedChipBar, {
        lens: 'global',
        onLensChange: () => undefined,
        standingAvailable: true,
        savedFeeds: [],
        activeFocus: { kind: 'hashtag', value: 'near' },
        onSelectSavedFeed: () => undefined,
        onRemoveSavedFeed: () => undefined,
        onClearFocus: () => undefined,
        onNewFeed: () => undefined,
      })
    );

    expect(html).toContain('>#near<');
    expect(html).toContain('aria-label="Clear feed focus"');
    expect(html).not.toContain('aria-selected="true">Global<');
  });
});
