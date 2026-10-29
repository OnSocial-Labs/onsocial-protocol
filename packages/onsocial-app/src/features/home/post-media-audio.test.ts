import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PostMediaBlock, PostMediaStrip } from './post-media';

describe('post audio attachments', () => {
  it('renders an audio file as a player, not an image', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [
          {
            url: 'https://example.com/voice.webm',
            mime: 'audio/webm',
            alt: 'Voice note',
          },
        ],
      })
    );

    expect(html).toContain('<audio');
    expect(html).toContain('src="https://example.com/voice.webm"');
    expect(html).toContain('Play Voice note');
    expect(html).toContain('post-audio-row');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('post-media-tile--compact');
    expect(html).not.toContain('aspect-ratio');
  });

  it('keeps a photo in the tile and puts audio beside it', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [
          { url: 'https://example.com/still.jpg', mime: 'image/jpeg' },
          { url: 'https://example.com/voice.webm', mime: 'audio/webm' },
        ],
      })
    );

    expect(html).toContain('post-media-strip--1');
    expect(html).not.toContain('is-collage');
    expect(html).toContain('<img');
    expect(html).toContain('<audio');
    expect(html).toContain('Play audio');
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
});
