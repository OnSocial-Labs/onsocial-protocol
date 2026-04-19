// ---------------------------------------------------------------------------
// Open Graph meta-tag generation for page previews
// ---------------------------------------------------------------------------

import type { PageData } from './types.js';

const DEFAULT_OG_IMAGE = 'https://onsocial.id/og-default.png';
const SITE_NAME = 'OnSocial';

export function ogTags(data: PageData, url: string): string {
  const name = data.profile.name ?? data.accountId;
  const description =
    data.config.tagline ?? data.profile.bio ?? `${name} on OnSocial`;
  const image = data.profile.avatar ?? DEFAULT_OG_IMAGE;
  const title = `${name} — ${SITE_NAME}`;

  return [
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ');
}

/** HTML-escape attribute values to prevent XSS. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;');
}
