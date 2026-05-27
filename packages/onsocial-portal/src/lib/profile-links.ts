const HANDLE_PATTERNS = {
  github: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  telegram: /^[A-Za-z0-9_]{5,32}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
} as const;

const LINK_HOSTS = {
  github: ['github.com'],
  telegram: ['t.me', 'telegram.me'],
  x: ['x.com', 'twitter.com'],
} as const;

const MAX_WEBSITE_URL_LEN = 255;

export type ProfileSocialLinkKind = keyof typeof HANDLE_PATTERNS;

export interface ProfileLinksInput {
  website: string;
  x: string;
  telegram: string;
  github: string;
}

export const PROFILE_LINK_KEYS = [
  'website',
  'x',
  'twitter',
  'telegram',
  'github',
] as const;

function hasPublicWebsiteHostname(hostname: string) {
  if (!hostname || hostname.startsWith('.') || hostname.endsWith('.')) {
    return false;
  }

  const labels = hostname.split('.');
  return labels.length >= 2 && labels.every((label) => label.length > 0);
}

export function normalizeWebsiteInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  if (withProtocol.length > MAX_WEBSITE_URL_LEN) {
    throw new Error(
      `Website must be ${MAX_WEBSITE_URL_LEN} characters or fewer`
    );
  }

  const url = new URL(withProtocol);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Website must be a valid http or https URL');
  }

  if (!hasPublicWebsiteHostname(url.hostname.toLowerCase())) {
    throw new Error('Website must include a domain like example.com');
  }

  if (url.toString().length > MAX_WEBSITE_URL_LEN) {
    throw new Error(
      `Website must be ${MAX_WEBSITE_URL_LEN} characters or fewer`
    );
  }

  return url.toString();
}

export function normalizeWebsiteForDisplay(value: string) {
  return normalizeWebsiteInput(value)
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
}

export function normalizeProfileHandleInput(
  value: string,
  kind: ProfileSocialLinkKind
) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/')) {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    if (!(LINK_HOSTS[kind] as readonly string[]).includes(hostname)) {
      throw new Error(`${linkLabel(kind)} must be a handle or valid link`);
    }

    const [handle, ...rest] = url.pathname.split('/').filter(Boolean);
    if (!handle || rest.length > 0) {
      throw new Error(`${linkLabel(kind)} must point to a single profile`);
    }

    candidate = handle;
  }

  candidate = candidate.replace(/^@/, '');

  if (!HANDLE_PATTERNS[kind].test(candidate)) {
    throw new Error(`${linkLabel(kind)} must be a valid handle`);
  }

  return candidate;
}

export function normalizeProfileLinksInput(
  input: ProfileLinksInput,
  currentLinks: Record<string, string> | undefined
) {
  const links = { ...(currentLinks ?? {}) };

  for (const key of PROFILE_LINK_KEYS) {
    delete links[key];
  }

  const website = normalizeWebsiteInput(input.website);
  const x = normalizeProfileHandleInput(input.x, 'x');
  const telegram = normalizeProfileHandleInput(input.telegram, 'telegram');
  const github = normalizeProfileHandleInput(input.github, 'github');

  if (website) links.website = website;
  if (x) links.x = x;
  if (telegram) links.telegram = telegram;
  if (github) links.github = github;

  return links;
}

export function buildProfileLinkUrl(
  value: string,
  kind: ProfileSocialLinkKind | 'website'
) {
  if (kind === 'website') return normalizeWebsiteInput(value);

  const handle = normalizeProfileHandleInput(value, kind);
  if (!handle) return '';

  if (kind === 'telegram') return `https://t.me/${handle}`;
  if (kind === 'github') return `https://github.com/${handle}`;
  return `https://x.com/${handle}`;
}

export function linkLabel(kind: ProfileSocialLinkKind) {
  if (kind === 'x') return 'X';
  return kind[0].toUpperCase() + kind.slice(1);
}
