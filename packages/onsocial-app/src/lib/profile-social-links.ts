import { normalizeLink } from './profile-display';

export type PortfolioLinkKind =
  | 'website'
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
}

const LINK_HOSTS: Record<Exclude<PortfolioLinkKind, 'custom'>, readonly string[]> =
  {
    website: [],
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
