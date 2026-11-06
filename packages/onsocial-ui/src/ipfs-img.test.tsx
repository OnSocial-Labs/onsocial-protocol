import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IpfsBlurPreview } from './ipfs-blur-preview.js';
import { IpfsImg } from './ipfs-img.js';

const CDN = 'https://cdn.testnet.onsocial.id';
const CID = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
const ORIGINAL = `${CDN}/ipfs/${CID}`;

describe('IpfsImg', () => {
  it('paints avif, then webp, then the original format', () => {
    const html = renderToStaticMarkup(
      createElement(IpfsImg, {
        src: ORIGINAL,
        srcSet: [
          `${CDN}/img/384/ipfs/${CID} 384w`,
          `${CDN}/img/1080/ipfs/${CID} 1080w`,
        ].join(', '),
        sizes: '(min-width: 640px) 553px, 100vw',
        alt: 'Harbor',
        width: 640,
        height: 480,
        loading: 'lazy',
      })
    );
    const avifAt = html.indexOf('type="image/avif"');
    const webpAt = html.indexOf('type="image/webp"');
    const imgAt = html.indexOf('<img');
    expect(avifAt).toBeGreaterThanOrEqual(0);
    expect(webpAt).toBeGreaterThan(avifAt);
    expect(imgAt).toBeGreaterThan(webpAt);
    expect(html).toContain(`${CDN}/img/384/avif/ipfs/${CID} 384w`);
    expect(html).toContain(`${CDN}/img/1080/avif/ipfs/${CID} 1080w`);
    expect(html).toContain(`${CDN}/img/384/webp/ipfs/${CID} 384w`);
    expect(html).toContain(`${CDN}/img/1080/webp/ipfs/${CID} 1080w`);
    expect(html).toContain(`src="${ORIGINAL}"`);
    expect(html).toContain(`${CDN}/img/384/ipfs/${CID} 384w`);
    expect(html).toContain('alt="Harbor"');
    expect(html).toContain('width="640"');
    expect(html).toContain('height="480"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('class="ipfs-img"');
    expect(html).toContain('sizes="(min-width: 640px) 553px, 100vw"');
  });

  it('uses one rung when the src is already a resized original', () => {
    const src = `${CDN}/img/384/ipfs/${CID}`;
    const html = renderToStaticMarkup(createElement(IpfsImg, { src, alt: '' }));
    expect(html).toContain(`${CDN}/img/384/avif/ipfs/${CID} 384w`);
    expect(html).toContain(`${CDN}/img/384/webp/ipfs/${CID} 384w`);
    expect(html).toContain(`src="${src}"`);
    expect(html).not.toContain('/img/128/');
    expect(html).not.toContain('/img/1080/');
  });

  it('leaves gif and off-host images as a single img', () => {
    const gif = renderToStaticMarkup(
      createElement(IpfsImg, {
        src: ORIGINAL,
        srcSet: `${CDN}/img/384/ipfs/${CID} 384w`,
        mime: 'image/gif',
        alt: '',
      })
    );
    expect(gif).not.toContain('<picture');
    expect(gif).not.toContain('/img/');
    expect(gif).toContain(`src="${ORIGINAL}"`);

    const external = renderToStaticMarkup(
      createElement(IpfsImg, {
        src: 'https://example.com/a.png',
        alt: 'Outside',
      })
    );
    expect(external).not.toContain('<picture');
    expect(external).toContain('alt="Outside"');
  });
});

describe('IpfsBlurPreview', () => {
  it('is decorative and follows avif, webp, then the 128px original', () => {
    const html = renderToStaticMarkup(
      createElement(IpfsBlurPreview, { src: ORIGINAL, mime: 'image/jpeg' })
    );
    const avifAt = html.indexOf('type="image/avif"');
    const webpAt = html.indexOf('type="image/webp"');
    const imgAt = html.indexOf('<img');
    expect(avifAt).toBeGreaterThanOrEqual(0);
    expect(webpAt).toBeGreaterThan(avifAt);
    expect(imgAt).toBeGreaterThan(webpAt);
    expect(html).toContain(`${CDN}/img/128/avif/ipfs/${CID} 128w`);
    expect(html).toContain(`${CDN}/img/128/webp/ipfs/${CID} 128w`);
    expect(html).toContain(`src="${CDN}/img/128/ipfs/${CID}"`);
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('ipfs-blur-preview');
  });

  it('skips gif and svg', () => {
    expect(
      renderToStaticMarkup(
        createElement(IpfsBlurPreview, { src: ORIGINAL, mime: 'image/gif' })
      )
    ).toBe('');
    expect(
      renderToStaticMarkup(
        createElement(IpfsBlurPreview, {
          src: ORIGINAL,
          mime: 'image/svg+xml',
        })
      )
    ).toBe('');
  });
});
