import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProfileAvatar } from '@onsocial/ui';
import { PostMediaStrip } from './post-media';

const CDN = 'https://cdn.testnet.onsocial.id';
const CID = 'bafkreihnbre4v4i7wpwxsepdmxbm6dy7zhyb5cw7dds6x6jz7fr6lin5ni';
const PHOTO = `${CDN}/ipfs/${CID}`;
const PREVIEW = `${CDN}/img/128/ipfs/${CID}`;

const here = dirname(fileURLToPath(import.meta.url));
const portfolioIdentity = readFileSync(
  join(here, '../../components/portfolio/portfolio-identity.tsx'),
  'utf8'
);
const globalsCss = readFileSync(join(here, '../../app/globals.css'), 'utf8');
const avatarCss = readFileSync(
  join(here, '../../../../onsocial-ui/profile-avatar.css'),
  'utf8'
);

describe('blurred image preview', () => {
  it('paints the 128px variant under a feed photo and keeps the full image', () => {
    const html = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [{ url: PHOTO, mime: 'image/jpeg', alt: 'Harbor' }],
      })
    );

    expect(html).toContain(`src="${PREVIEW}"`);
    expect(html).toContain(`${CDN}/img/128/avif/ipfs/${CID}`);
    expect(html).toContain(`${CDN}/img/128/webp/ipfs/${CID}`);
    expect(html).toContain('type="image/avif"');
    expect(html).toContain('type="image/webp"');
    expect(html).toContain('ipfs-blur-preview');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(`src="${PHOTO}"`);
    expect(html).toContain('alt="Harbor"');
    expect(html).toContain('post-media-element');
  });

  it('skips the preview for gif and for off-host files', () => {
    const gif = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [{ url: PHOTO, mime: 'image/gif' }],
      })
    );
    expect(gif).not.toContain('ipfs-blur-preview');
    expect(gif).not.toContain('/img/128/');

    const external = renderToStaticMarkup(
      createElement(PostMediaStrip, {
        items: [{ url: 'https://images.example/pic.jpg', mime: 'image/jpeg' }],
      })
    );
    expect(external).not.toContain('ipfs-blur-preview');
  });

  it('paints the same preview under an avatar', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileAvatar, { src: PHOTO, fallbackInitial: 'A' })
    );

    expect(html).toContain(`src="${PREVIEW}"`);
    expect(html).toContain(`${CDN}/img/128/avif/ipfs/${CID}`);
    expect(html).toContain('ipfs-blur-preview');
    expect(html).toContain('profile-avatar__img');
    expect(html).toContain(`src="${PHOTO}"`);
  });

  it('uses the same preview on the profile face', () => {
    expect(portfolioIdentity).toContain('IpfsBlurPreview');
    expect(portfolioIdentity).toContain('has-blur-preview');
    expect(portfolioIdentity).toContain('portfolio-avatar-img');
  });

  it('keeps the crossfade off when the viewer prefers reduced motion', () => {
    expect(globalsCss).toMatch(
      /\.post-media-element \{[^}]*opacity:\s*0;[^}]*transition:\s*opacity 160ms ease;/
    );
    expect(globalsCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.post-media-element[^}]*transition:\s*none;/
    );
    expect(globalsCss).toMatch(
      /\.portfolio-avatar\.has-blur-preview \.portfolio-avatar-img \{[^}]*opacity:\s*0;[^}]*transition:\s*opacity 180ms ease;/
    );
    expect(globalsCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.portfolio-avatar\.has-blur-preview \.portfolio-avatar-img \{[^}]*transition:\s*none;/
    );
    expect(avatarCss).toMatch(
      /\.ipfs-blur-preview \{[^}]*filter:\s*blur\(8px\);/
    );
    expect(avatarCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.ipfs-blur-preview \{[^}]*animation:\s*none;[^}]*transition:\s*none;/
    );
  });
});
