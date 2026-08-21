import { normalizeLink } from './profile-display';
import { appPageHref, PUBLIC_APP_ORIGIN } from '@/lib/app-links';
import { normalizeNearAccountId } from '@/lib/app-near-account';

export type PortfolioLinkKind =
  | 'website'
  | 'onsocial'
  | 'x'
  | 'telegram'
  | 'github'
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube'
  | 'discord'
  | 'custom';

export interface PortfolioSocialLink {
  key: string;
  kind: PortfolioLinkKind;
  label: string;
  href: string;
  /** Optional Launch drawer blurb from page config. */
  note?: string;
}

const LINK_HOSTS: Record<Exclude<PortfolioLinkKind, 'custom'>, readonly string[]> =
  {
    website: [],
    onsocial: ['onsocial.id', 'testnet.onsocial.id'],
    github: ['github.com'],
    telegram: ['t.me', 'telegram.me'],
    x: ['x.com', 'twitter.com'],
    instagram: ['instagram.com'],
    tiktok: ['tiktok.com'],
    linkedin: ['linkedin.com'],
    youtube: ['youtube.com', 'youtu.be'],
    discord: ['discord.gg', 'discord.com'],
  };

const LABEL_KIND_ALIASES: Record<string, PortfolioLinkKind> = {
  website: 'website',
  site: 'website',
  onsocial: 'onsocial',
  near: 'onsocial',
  x: 'x',
  twitter: 'x',
  telegram: 'telegram',
  github: 'github',
  instagram: 'instagram',
  tiktok: 'tiktok',
  linkedin: 'linkedin',
  youtube: 'youtube',
  discord: 'discord',
};

const KEYED_DISPLAY_FIELDS: Array<{
  key: string;
  kind: Exclude<PortfolioLinkKind, 'custom'>;
  resolve: (links: Record<string, string>) => string | undefined;
  label: string;
}> = [
  { key: 'website', kind: 'website', label: 'Website', resolve: (l) => l.website },
  {
    key: 'onsocial',
    kind: 'onsocial',
    label: 'OnSocial',
    resolve: (l) => l.onsocial,
  },
  {
    key: 'x',
    kind: 'x',
    label: 'X',
    resolve: (l) => l.x ?? l.twitter,
  },
  {
    key: 'telegram',
    kind: 'telegram',
    label: 'Telegram',
    resolve: (l) => l.telegram,
  },
  {
    key: 'instagram',
    kind: 'instagram',
    label: 'Instagram',
    resolve: (l) => l.instagram,
  },
  {
    key: 'tiktok',
    kind: 'tiktok',
    label: 'TikTok',
    resolve: (l) => l.tiktok,
  },
  {
    key: 'linkedin',
    kind: 'linkedin',
    label: 'LinkedIn',
    resolve: (l) => l.linkedin,
  },
  {
    key: 'youtube',
    kind: 'youtube',
    label: 'YouTube',
    resolve: (l) => l.youtube,
  },
  {
    key: 'github',
    kind: 'github',
    label: 'GitHub',
    resolve: (l) => l.github,
  },
  {
    key: 'discord',
    kind: 'discord',
    label: 'Discord',
    resolve: (l) => l.discord,
  },
];

function kindFromHostname(hostname: string): PortfolioLinkKind | null {
  const host = hostname.toLowerCase().replace(/^www\./, '');

  try {
    const publicHost = new URL(PUBLIC_APP_ORIGIN).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    if (host === publicHost) return 'onsocial';
  } catch {
    // ignore
  }

  for (const [kind, hosts] of Object.entries(LINK_HOSTS) as Array<
    [Exclude<PortfolioLinkKind, 'custom' | 'website'>, readonly string[]]
  >) {
    if (hosts.includes(host)) {
      return kind;
    }
  }

  return null;
}

export function inferPortfolioLinkKind(
  label: string,
  href: string
): PortfolioLinkKind {
  const normalizedLabel = label.trim().toLowerCase();
  if (LABEL_KIND_ALIASES[normalizedLabel]) {
    return LABEL_KIND_ALIASES[normalizedLabel];
  }

  try {
    const hostKind = kindFromHostname(new URL(href).hostname);
    if (hostKind) {
      return hostKind;
    }
  } catch {
    // fall through
  }

  return 'custom';
}

function buildHrefFromStored(
  stored: string,
  kind: Exclude<PortfolioLinkKind, 'custom' | 'website'>
): string | null {
  const value = stored.trim().replace(/^@/, '');
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return normalizeLink(value);
  }

  switch (kind) {
    case 'onsocial': {
      const accountId = normalizeNearAccountId(value);
      return accountId ? appPageHref(accountId) : null;
    }
    case 'telegram':
      return `https://t.me/${value}`;
    case 'github':
      return `https://github.com/${value}`;
    case 'instagram':
      return `https://instagram.com/${value}`;
    case 'tiktok':
      return `https://tiktok.com/@${value.replace(/^@/, '')}`;
    case 'linkedin':
      if (value.startsWith('company/') || value.startsWith('in/')) {
        return `https://linkedin.com/${value}`;
      }
      return `https://linkedin.com/in/${value}`;
    case 'youtube':
      if (
        value.startsWith('channel/') ||
        value.startsWith('c/') ||
        value.startsWith('user/')
      ) {
        return `https://youtube.com/${value}`;
      }
      return `https://youtube.com/${value.startsWith('@') ? value : `@${value}`}`;
    case 'discord':
      return `https://discord.gg/${value}`;
    default:
      return `https://x.com/${value}`;
  }
}

function hrefForKeyedLink(
  raw: string,
  kind: Exclude<PortfolioLinkKind, 'custom'>
): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (kind === 'website') {
    return normalizeLink(trimmed);
  }

  if (kind === 'onsocial') {
    return buildHrefFromStored(trimmed, 'onsocial');
  }

  const direct = normalizeLink(trimmed);
  if (direct) {
    try {
      const hostKind = kindFromHostname(new URL(direct).hostname);
      if (hostKind === kind) {
        return direct;
      }
    } catch {
      // fall through to handle builder
    }
  }

  return buildHrefFromStored(trimmed, kind);
}

function resolveKeyedLinks(
  links: Record<string, string>
): PortfolioSocialLink[] {
  return KEYED_DISPLAY_FIELDS.flatMap((field) => {
    const raw = field.resolve(links);
    if (!raw?.trim()) {
      return [];
    }

    const href = hrefForKeyedLink(raw, field.kind);
    if (!href) {
      return [];
    }

    return [
      {
        key: field.key,
        kind: field.kind,
        label: field.label,
        href,
      },
    ];
  });
}

function resolveArrayLinks(
  links: Array<{ label: string; url: string }>
): PortfolioSocialLink[] {
  return links.flatMap((entry) => {
    const label = entry.label.trim();
    const href = normalizeLink(entry.url);
    if (!label || !href) {
      return [];
    }

    const kind = inferPortfolioLinkKind(label, href);
    return [
      {
        key: `${kind}:${href}`,
        kind,
        label,
        href,
      },
    ];
  });
}

const LINKEDIN_PATH_PREFIXES = new Set([
  'in',
  'company',
  'school',
  'showcase',
  'pub',
]);

const YOUTUBE_PATH_PREFIXES = new Set(['channel', 'c', 'user']);

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function hrefPathSegments(href: string): string[] {
  try {
    return new URL(href).pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean)
      .map(decodePathSegment);
  } catch {
    return [];
  }
}

function bareHandle(value: string): string {
  return value.replace(/^@/, '').trim();
}

function withAtPrefix(value: string): string {
  const bare = bareHandle(value);
  return bare ? `@${bare}` : '';
}

function collapseLinkText(value: string): string {
  return bareHandle(value).toLowerCase();
}

/** Hostname for showcase rows — strips www, falls back to label. */
export function portfolioLinkHostname(href: string): string | null {
  try {
    const host = new URL(href).hostname.replace(/^www\./i, '');
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Quiet destination line — hostname or identity slug.
 * Never uses the first URL folder as a fake @handle (`/company/…` → company).
 */
export function portfolioLinkDestination(link: PortfolioSocialLink): string {
  if (link.kind === 'website' || link.kind === 'custom') {
    return portfolioLinkHostname(link.href) ?? '';
  }

  const segments = hrefPathSegments(link.href);
  if (segments.length === 0) {
    return '';
  }

  switch (link.kind) {
    case 'linkedin': {
      const prefix = segments[0]!.toLowerCase();
      if (LINKEDIN_PATH_PREFIXES.has(prefix) && segments[1]) {
        return bareHandle(segments[1]);
      }
      return bareHandle(segments[segments.length - 1]!);
    }
    case 'github':
      return bareHandle(segments[0]!);
    case 'discord':
      return bareHandle(segments[segments.length - 1]!);
    case 'youtube': {
      const first = segments[0]!;
      if (first.startsWith('@')) {
        return withAtPrefix(first);
      }
      const folder = first.toLowerCase();
      if (YOUTUBE_PATH_PREFIXES.has(folder) && segments[1]) {
        const name = segments[1];
        return name.startsWith('@') ? withAtPrefix(name) : bareHandle(name);
      }
      return withAtPrefix(first);
    }
    case 'x':
    case 'instagram':
    case 'telegram':
    case 'tiktok':
      return withAtPrefix(segments[0]!);
    default:
      return withAtPrefix(segments[0]!);
  }
}

/** Owner note becomes the title; generic "Website" / "GitHub" is the fallback. */
export function portfolioLinkTitle(link: PortfolioSocialLink): string {
  const note = link.note?.trim();
  return note || link.label;
}

/** Launch row: custom name on top, destination underneath when it is not the same text. */
export function portfolioLinkPresentation(link: PortfolioSocialLink): {
  title: string;
  detail: string | null;
} {
  const title = portfolioLinkTitle(link);
  const destination = portfolioLinkDestination(link);
  if (!destination || collapseLinkText(destination) === collapseLinkText(title)) {
    return { title, detail: null };
  }
  return { title, detail: destination };
}

/** Attach optional Launch notes from page config onto resolved links. */
export function applyPortfolioLinkNotes(
  links: PortfolioSocialLink[],
  notes: Record<string, string> | null | undefined
): PortfolioSocialLink[] {
  if (!notes || Object.keys(notes).length === 0) {
    return links;
  }
  return links.map((link) => {
    const note = notes[link.key]?.trim();
    return note ? { ...link, note } : link;
  });
}

/** Portal-parity social rows for keyed chain maps and schema v1 link arrays. */
export function resolvePortfolioSocialLinks(
  links: unknown
): PortfolioSocialLink[] {
  if (!links) {
    return [];
  }

  if (Array.isArray(links)) {
    const rows = links.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const row = entry as Record<string, unknown>;
      const label = typeof row.label === 'string' ? row.label.trim() : '';
      const url = typeof row.url === 'string' ? row.url.trim() : '';
      if (!label || !url) {
        return [];
      }

      return [{ label, url }];
    });

    return resolveArrayLinks(rows);
  }

  if (typeof links === 'object') {
    const record = Object.fromEntries(
      Object.entries(links as Record<string, unknown>).flatMap(([key, value]) => {
        if (typeof value !== 'string' || !value.trim()) {
          return [];
        }
        return [[key, value.trim()]];
      })
    );

    return resolveKeyedLinks(record);
  }

  return [];
}
