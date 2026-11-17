import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFeedMediaMeasuredRatios,
  PostMediaBlock,
  PostMediaStrip,
} from './post-media';

describe('post audio attachments', () => {
  beforeEach(() => {
    clearFeedMediaMeasuredRatios();
  });
  it('renders feed audio as a jacket that opens the player, not an inline row', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [
          {
            url: 'https://example.com/voice.webm',
            mime: 'audio/webm',
            alt: 'Voice note',
          },
        ],
        onAudioOpen: () => {},
      })
    );

    expect(html).toContain('post-audio-jacket');
    expect(html).toContain('Listen to Voice note');
    expect(html).toContain('scarce-post-preview-play');
    expect(html).not.toContain('post-audio-row');
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('<img');
  });

  it('keeps a photo in the tile and puts an audio jacket beside it', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [
          { url: 'https://example.com/still.jpg', mime: 'image/jpeg' },
          { url: 'https://example.com/voice.webm', mime: 'audio/webm' },
        ],
        onAudioOpen: () => {},
      })
    );

    expect(html).toContain('post-media-strip--1');
    expect(html).not.toContain('is-collage');
    expect(html).toContain('<img');
    expect(html).toContain('post-audio-jacket');
    expect(html).toContain('Listen');
    expect(html).not.toContain('post-audio-row');
  });

  it('uses a square preview control in the composer', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaBlock, {
        item: { url: 'blob:voice', mime: 'audio/mpeg' },
        size: 'preview',
      })
    );

    expect(html).toContain('post-audio-preview');
    expect(html).toContain('Play audio');
    expect(html).not.toContain('<img');
  });

  it('falls back to the inline row when onAudioOpen is omitted', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [
          {
            url: 'https://example.com/voice.webm',
            mime: 'audio/webm',
            alt: 'Voice note',
          },
        ],
        size: 'page',
      })
    );

    expect(html).toContain('post-audio-row');
    expect(html).not.toContain('post-audio-jacket');
  });

  it('does not force a 4:3 page seat when media has no width/height hints', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [
          {
            url: 'https://example.com/still.jpg',
            mime: 'image/jpeg',
          },
        ],
        size: 'page',
      })
    );

    expect(html).toContain('post-media-tile--page');
    expect(html).not.toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
  });

  it('prefers persisted dims over the 4:3 page fallback', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [
          {
            url: 'https://example.com/tall.jpg',
            mime: 'image/jpeg',
            width: 9,
            height: 16,
          },
        ],
        size: 'page',
      })
    );

    expect(html).toMatch(/aspect-ratio:\s*9\s*\/\s*16/);
    expect(html).not.toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
  });
});
