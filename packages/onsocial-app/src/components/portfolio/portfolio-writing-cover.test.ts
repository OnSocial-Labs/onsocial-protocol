import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  PortfolioWritingCover,
  previewWritingCoverSvg,
} from './portfolio-writing-cover';

const CDN = 'https://cdn.testnet.onsocial.id';
const CID = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const PHOTO = `${CDN}/ipfs/${CID}`;

const cover = {
  title: 'A note',
  postId: 'post-1',
  issuedAt: 1_700_000_000_000,
};

describe('previewWritingCoverSvg', () => {
  it('uses the spoken account name when no profile name is set', () => {
    const svg = previewWritingCoverSvg({
      ...cover,
      accountId: 'alice.near',
    });
    expect(svg).toContain('Alice');
    expect(svg).toContain('alice.near');
  });

  it('keeps a custom profile name above the account id', () => {
    const svg = previewWritingCoverSvg({
      ...cover,
      accountId: 'alice.near',
      displayName: 'Alice Builder',
    });
    expect(svg).toContain('Alice Builder');
    expect(svg).toContain('alice.near');
  });
});

describe('writing cover photo', () => {
  const base = {
    title: 'A note',
    accountId: 'alice.near',
    postId: 'post-1',
    issuedAt: 1_700_000_000_000,
    coverUrl: PHOTO,
  };

  it('paints the blurred 128px preview under the shared picture', () => {
    const html = renderToStaticMarkup(
      createElement(PortfolioWritingCover, { ...base, variant: 'article' })
    );
    expect(html).toContain('ipfs-blur-preview');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(`${CDN}/img/128/avif/ipfs/${CID}`);
    expect(html).toContain(`${CDN}/img/128/webp/ipfs/${CID}`);
    expect(html).toContain(`${CDN}/img/384/avif/ipfs/${CID}`);
    expect(html).toContain(`${CDN}/img/1080/avif/ipfs/${CID}`);
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
    expect(html).toContain(`src="${PHOTO}"`);
    expect(html).toContain('alt=""');
    expect(html).toContain('portfolio-writing-cover-photo is-pending');
    const photo = html
      .match(/<img\b[^>]*>/g)
      ?.find((tag) => tag.includes('portfolio-writing-cover-photo'));
    const photoSrcSet = photo?.match(/srcSet="([^"]*)"/)?.[1];
    expect(photoSrcSet).toContain(`/img/384/ipfs/${CID} 384w`);
    expect(photoSrcSet).toContain(`/img/1080/ipfs/${CID} 1080w`);
    expect(photoSrcSet).not.toContain('/img/128/');
  });

  it('keeps a list thumb on the small rungs and skips a preview that cannot resize', () => {
    const list = renderToStaticMarkup(
      createElement(PortfolioWritingCover, { ...base, variant: 'list' })
    );
    expect(list).toContain(`${CDN}/img/128/avif/ipfs/${CID}`);
    expect(list).toContain(`${CDN}/img/384/avif/ipfs/${CID}`);
    expect(list).not.toContain('/img/1080/');

    const external = renderToStaticMarkup(
      createElement(PortfolioWritingCover, {
        ...base,
        coverUrl: 'https://images.example/pic.jpg',
        alt: 'Harbor at dusk',
      })
    );
    expect(external).not.toContain('ipfs-blur-preview');
    expect(external).toContain('alt="Harbor at dusk"');
    expect(external).not.toContain('is-pending');
  });

  it('skips the fade when the viewer prefers reduced motion', () => {
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../app/globals.css'),
      'utf8'
    );
    expect(css).toMatch(
      /\.portfolio-writing-cover-photo\.is-pending \{[^}]*opacity:\s*0;[^}]*transition:\s*opacity var\(--os-motion-chip, 160ms\) ease;/
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.portfolio-writing-cover-photo\.is-pending \{[^}]*transition:\s*none;/
    );
  });
});
