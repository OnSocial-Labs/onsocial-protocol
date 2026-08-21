import {
  getNearAccountInputError,
  isNearNamedAccountComplete,
  normalizeNearAccountId,
  nearAccountPlaceholder,
  nearAccountSuffixHint,
} from '@/lib/app-near-account';
import { appPageHref, PUBLIC_APP_ORIGIN } from '@/lib/app-links';

const HANDLE_PATTERNS = {
  github: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  telegram: /^[A-Za-z0-9_]{5,32}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  linkedin:
    /^(?:in\/[A-Za-z0-9-_%]+|company\/[A-Za-z0-9-_%]+|[A-Za-z0-9-]{3,100})$/,
  youtube:
    /^(?:@?[A-Za-z0-9._-]{3,}|channel\/[A-Za-z0-9_-]{10,}|c\/[A-Za-z0-9._-]+|user\/[A-Za-z0-9._-]+)$/,
  discord: /^[A-Za-z0-9-]{2,32}$/,
} as const;

const LINK_HOSTS = {
  github: ['github.com'],
  telegram: ['t.me', 'telegram.me'],
  x: ['x.com', 'twitter.com'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be'],
  discord: ['discord.gg', 'discord.com'],
} as const;

const ONSOCIAL_LINK_HOSTS = [
  'onsocial.id',
  'testnet.onsocial.id',
  'www.onsocial.id',
] as const;

const MAX_WEBSITE_URL_LEN = 255;

export type ProfileSocialLinkKind = keyof typeof HANDLE_PATTERNS;

export type ProfileLinkKind = ProfileSocialLinkKind | 'website' | 'onsocial';

export interface ProfileLinksInput {
  website: string;
  onsocial: string;
  x: string;
  telegram: string;
  github: string;
  instagram: string;
  tiktok: string;
  linkedin: string;
  youtube: string;
  discord: string;
}

export const PROFILE_LINK_KEYS = [
  'website',
  'onsocial',
  'x',
  'twitter',
  'telegram',
  'github',
  'instagram',
  'tiktok',
  'linkedin',
  'youtube',
  'discord',
] as const;

export const PROFILE_LINK_EDITOR_FIELDS: Array<{
  key: keyof ProfileLinksInput;
  kind: ProfileLinkKind;
  label: string;
  placeholder: string;
  fullWidth?: boolean;
}> = [
  {
    key: 'website',
    kind: 'website',
    label: 'Website',
    placeholder: 'example.com',
    fullWidth: true,
  },
  {
    key: 'onsocial',
    kind: 'onsocial',
    label: 'OnSocial',
    placeholder: nearAccountPlaceholder(),
  },
  {
    key: 'x',
    kind: 'x',
    label: 'X',
    placeholder: 'handle',
  },
  {
    key: 'telegram',
    kind: 'telegram',
    label: 'Telegram',
    placeholder: 'handle',
  },
  {
    key: 'instagram',
    kind: 'instagram',
    label: 'Instagram',
    placeholder: 'handle',
  },
  {
    key: 'tiktok',
    kind: 'tiktok',
    label: 'TikTok',
    placeholder: 'handle',
  },
  {
    key: 'linkedin',
    kind: 'linkedin',
    label: 'LinkedIn',
    placeholder: 'in/you',
  },
  {
    key: 'youtube',
    kind: 'youtube',
    label: 'YouTube',
    placeholder: '@channel',
  },
  {
    key: 'github',
    kind: 'github',
    label: 'GitHub',
    placeholder: 'username',
  },
  {
    key: 'discord',
    kind: 'discord',
    label: 'Discord',
    placeholder: 'invite-code',
  },
];

export const PROFILE_LINK_PRIMARY_FIELD_KEYS = [
  'website',
  'onsocial',
  'x',
] as const satisfies ReadonlyArray<keyof ProfileLinksInput>;

export const PROFILE_LINK_PRIMARY_FIELDS = PROFILE_LINK_EDITOR_FIELDS.filter(
  (field) =>
    (PROFILE_LINK_PRIMARY_FIELD_KEYS as readonly string[]).includes(field.key)
);

export const PROFILE_LINK_SECONDARY_FIELDS = PROFILE_LINK_EDITOR_FIELDS.filter(
  (field) =>
    !(PROFILE_LINK_PRIMARY_FIELD_KEYS as readonly string[]).includes(field.key)
);

export function profileLinksHasSecondaryInput(links: ProfileLinksInput): boolean {
  return PROFILE_LINK_SECONDARY_FIELDS.some(
    (field) => links[field.key].trim().length > 0
  );
}

export const PROFILE_LINK_DISPLAY_FIELDS: Array<{
  key: string;
  label: string;
  kind: ProfileLinkKind;
  resolveValue: (links: Record<string, string>) => string | undefined;
}> = [
  {
    key: 'website',
    label: 'Website',
    kind: 'website',
    resolveValue: (links) => links.website,
  },
  {
    key: 'onsocial',
    label: 'OnSocial',
    kind: 'onsocial',
    resolveValue: (links) => links.onsocial,
  },
  {
    key: 'x',
    label: 'X',
    kind: 'x',
    resolveValue: (links) => links.x ?? links.twitter,
  },
  {
    key: 'telegram',
    label: 'Telegram',
    kind: 'telegram',
    resolveValue: (links) => links.telegram,
  },
  {
    key: 'instagram',
    label: 'Instagram',
    kind: 'instagram',
    resolveValue: (links) => links.instagram,
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    kind: 'tiktok',
    resolveValue: (links) => links.tiktok,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    kind: 'linkedin',
    resolveValue: (links) => links.linkedin,
  },
  {
    key: 'youtube',
    label: 'YouTube',
    kind: 'youtube',
    resolveValue: (links) => links.youtube,
  },
  {
    key: 'github',
    label: 'GitHub',
    kind: 'github',
    resolveValue: (links) => links.github,
  },
  {
    key: 'discord',
    label: 'Discord',
    kind: 'discord',
    resolveValue: (links) => links.discord,
  },
];

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

function isOnSocialHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  if ((ONSOCIAL_LINK_HOSTS as readonly string[]).includes(host)) {
    return true;
  }
  try {
    const publicHost = new URL(PUBLIC_APP_ORIGIN).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    return host === publicHost;
  } catch {
    return false;
  }
}

function extractOnSocialAccountFromUrl(url: URL): string | null {
  if (!isOnSocialHost(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (!parts[0]) return null;
  if (parts[0].startsWith('@')) {
    return parts[0].slice(1);
  }
  if (
    (parts[0] === 'u' || parts[0] === '@') &&
    parts[1]
  ) {
    return parts[1].replace(/^@/, '');
  }
  return parts[0].replace(/^@/, '');
}

/**
 * Accept a NEAR account id or an OnSocial profile URL; store the account id.
 * Format is validated for the active network (`.near`/`.tg` or `.testnet`).
 */
export function normalizeOnSocialAccountInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let candidate = trimmed.replace(/^@/, '');

  if (
    /^https?:\/\//i.test(trimmed) ||
    /onsocial\.id/i.test(trimmed) ||
    trimmed.includes('/')
  ) {
    try {
      const withProtocol = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      const fromUrl = extractOnSocialAccountFromUrl(new URL(withProtocol));
      if (fromUrl) {
        candidate = fromUrl;
      }
    } catch {
      // fall through to NEAR id parse
    }
  }

  candidate = normalizeNearAccountId(candidate);
  const formatError = getNearAccountInputError(candidate);
  if (formatError) {
    throw new Error(formatError);
  }
  if (!isNearNamedAccountComplete(candidate)) {
    throw new Error(
      `Use a complete NEAR account (${nearAccountSuffixHint()}).`
    );
  }
  return candidate;
}

function extractHandleFromProfileUrl(
  url: URL,
  kind: ProfileSocialLinkKind
): string {
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const allowedHosts = LINK_HOSTS[kind] as readonly string[];

  if (!allowedHosts.includes(hostname)) {
    throw new Error(`${linkLabel(kind)} must be a handle or valid link`);
  }

  const parts = url.pathname.split('/').filter(Boolean);

  if (kind === 'linkedin') {
    if (parts[0] === 'in' && parts[1]) return `in/${parts[1]}`;
    if (parts[0] === 'company' && parts[1]) return `company/${parts[1]}`;
    throw new Error(
      `${linkLabel(kind)} must point to a profile or company page`
    );
  }

  if (kind === 'youtube') {
    if (parts[0]?.startsWith('@')) return parts[0];
    if (parts[0] === 'channel' && parts[1]) return `channel/${parts[1]}`;
    if (parts[0] === 'c' && parts[1]) return `c/${parts[1]}`;
    if (parts[0] === 'user' && parts[1]) return `user/${parts[1]}`;
    throw new Error(`${linkLabel(kind)} must point to a channel or handle`);
  }

  if (kind === 'discord') {
    if (hostname === 'discord.gg' && parts[0]) return parts[0];
    if (parts[0] === 'invite' && parts[1]) return parts[1];
    throw new Error(`${linkLabel(kind)} must be an invite link or code`);
  }

  if (kind === 'tiktok') {
    const handle = parts[0]?.replace(/^@/, '');
    if (handle && parts.length === 1) return handle;
    throw new Error(`${linkLabel(kind)} must point to a single profile`);
  }

  const [handle, ...rest] = parts;
  if (!handle || rest.length > 0) {
    throw new Error(`${linkLabel(kind)} must point to a single profile`);
  }

  return handle.replace(/^@/, '');
}

export function normalizeProfileHandleInput(
  value: string,
  kind: ProfileSocialLinkKind
) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  let candidate = trimmed.replace(/^@/, '');

  if (kind === 'linkedin' && !candidate.includes('/')) {
    candidate = `in/${candidate}`;
  }

  if (HANDLE_PATTERNS[kind].test(candidate)) {
    return candidate;
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('/')) {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    candidate = extractHandleFromProfileUrl(new URL(withProtocol), kind);

    if (kind === 'linkedin' && !candidate.includes('/')) {
      candidate = `in/${candidate}`;
    }
  }

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
  const onsocial = normalizeOnSocialAccountInput(input.onsocial);
  const x = normalizeProfileHandleInput(input.x, 'x');
  const telegram = normalizeProfileHandleInput(input.telegram, 'telegram');
  const github = normalizeProfileHandleInput(input.github, 'github');
  const instagram = normalizeProfileHandleInput(input.instagram, 'instagram');
  const tiktok = normalizeProfileHandleInput(input.tiktok, 'tiktok');
  const linkedin = normalizeProfileHandleInput(input.linkedin, 'linkedin');
  const youtube = normalizeProfileHandleInput(input.youtube, 'youtube');
  const discord = normalizeProfileHandleInput(input.discord, 'discord');

  if (website) links.website = website;
  if (onsocial) links.onsocial = onsocial;
  if (x) links.x = x;
  if (telegram) links.telegram = telegram;
  if (github) links.github = github;
  if (instagram) links.instagram = instagram;
  if (tiktok) links.tiktok = tiktok;
  if (linkedin) links.linkedin = linkedin;
  if (youtube) links.youtube = youtube;
  if (discord) links.discord = discord;

  return links;
}

export function buildProfileLinkUrl(value: string, kind: ProfileLinkKind) {
  if (kind === 'website') return normalizeWebsiteInput(value);
  if (kind === 'onsocial') {
    const accountId = normalizeOnSocialAccountInput(value);
    if (!accountId) return '';
    return appPageHref(accountId);
  }

  const handle = normalizeProfileHandleInput(value, kind);
  if (!handle) return '';

  return buildProfileLinkUrlFromStored(handle, kind);
}

function buildProfileLinkUrlFromStored(
  stored: string,
  kind: Exclude<ProfileLinkKind, 'website'>
): string {
  switch (kind) {
    case 'onsocial':
      return appPageHref(stored);
    case 'telegram':
      return `https://t.me/${stored}`;
    case 'github':
      return `https://github.com/${stored}`;
    case 'instagram':
      return `https://instagram.com/${stored}`;
    case 'tiktok':
      return `https://tiktok.com/@${stored.replace(/^@/, '')}`;
    case 'linkedin':
      if (stored.startsWith('company/')) {
        return `https://linkedin.com/${stored}`;
      }
      if (stored.startsWith('in/')) {
        return `https://linkedin.com/${stored}`;
      }
      return `https://linkedin.com/in/${stored}`;
    case 'youtube':
      if (
        stored.startsWith('channel/') ||
        stored.startsWith('c/') ||
        stored.startsWith('user/')
      ) {
        return `https://youtube.com/${stored}`;
      }
      return `https://youtube.com/${stored.startsWith('@') ? stored : `@${stored}`}`;
    case 'discord':
      return `https://discord.gg/${stored}`;
    default:
      return `https://x.com/${stored.replace(/^@/, '')}`;
  }
}

export function linkLabel(kind: ProfileSocialLinkKind | 'onsocial') {
  if (kind === 'onsocial') return 'OnSocial';
  if (kind === 'x') return 'X';
  if (kind === 'tiktok') return 'TikTok';
  if (kind === 'youtube') return 'YouTube';
  return kind[0].toUpperCase() + kind.slice(1);
}

function safeNormalizeWebsiteForDisplay(value?: string): string {
  if (!value) return '';
  try {
    return normalizeWebsiteForDisplay(value);
  } catch {
    return value;
  }
}

function safeNormalizeProfileHandle(
  value: string | undefined,
  kind: ProfileSocialLinkKind
): string {
  if (!value) return '';
  try {
    return normalizeProfileHandleInput(value, kind);
  } catch {
    return value.trim().replace(/^@/, '');
  }
}

export interface ProfileLinkEditorFormatResult {
  value: string;
  error: string | null;
  valid: boolean;
}

/** Normalize a single editor link on blur — editor-friendly display or inline error. */
export function formatProfileLinkForEditor(
  value: string,
  kind: ProfileLinkKind
): ProfileLinkEditorFormatResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: '', error: null, valid: true };
  }

  try {
    if (kind === 'website') {
      return {
        value: normalizeWebsiteForDisplay(trimmed),
        error: null,
        valid: true,
      };
    }

    if (kind === 'onsocial') {
      return {
        value: normalizeOnSocialAccountInput(trimmed),
        error: null,
        valid: true,
      };
    }

    return {
      value: normalizeProfileHandleInput(trimmed, kind),
      error: null,
      valid: true,
    };
  } catch (err) {
    return {
      value:
        kind === 'onsocial'
          ? normalizeNearAccountId(trimmed.replace(/^@/, ''))
          : trimmed.replace(/^@/, ''),
      error: err instanceof Error ? err.message : 'Invalid link',
      valid: false,
    };
  }
}

export function profileLinkEditorInlineError(
  kind: ProfileLinkKind,
  detail?: string | null
): string {
  if (kind === 'website') return 'Invalid URL';
  if (kind === 'onsocial') {
    const lower = (detail ?? '').toLowerCase();
    if (lower.includes('not found')) return 'Not found';
    if (lower.includes('verify')) return "Can't verify";
    if (detail && detail.length <= 40) return detail;
    return 'Invalid account';
  }
  return 'Invalid handle';
}

export function profileLinkEditorFieldErrors(
  links: ProfileLinksInput
): Partial<Record<keyof ProfileLinksInput, string>> {
  const errors: Partial<Record<keyof ProfileLinksInput, string>> = {};

  for (const field of PROFILE_LINK_EDITOR_FIELDS) {
    const result = formatProfileLinkForEditor(links[field.key], field.kind);
    if (!result.valid && result.error) {
      errors[field.key] = result.error;
    }
  }

  return errors;
}

export function isProfileLinkEditorPreviewable(
  value: string,
  kind: ProfileLinkKind
): boolean {
  if (!value.trim()) {
    return false;
  }

  return formatProfileLinkForEditor(value, kind).valid;
}

function safeNormalizeOnSocialAccount(value?: string): string {
  if (!value) return '';
  try {
    return normalizeOnSocialAccountInput(value);
  } catch {
    return normalizeNearAccountId(value.trim().replace(/^@/, ''));
  }
}

export function profileLinksInputFromRecord(
  links?: Record<string, string> | null
): ProfileLinksInput {
  return {
    website: safeNormalizeWebsiteForDisplay(links?.website),
    onsocial: safeNormalizeOnSocialAccount(links?.onsocial),
    x: safeNormalizeProfileHandle(links?.x ?? links?.twitter, 'x'),
    telegram: safeNormalizeProfileHandle(links?.telegram, 'telegram'),
    github: safeNormalizeProfileHandle(links?.github, 'github'),
    instagram: safeNormalizeProfileHandle(links?.instagram, 'instagram'),
    tiktok: safeNormalizeProfileHandle(links?.tiktok, 'tiktok'),
    linkedin: safeNormalizeProfileHandle(links?.linkedin, 'linkedin'),
    youtube: safeNormalizeProfileHandle(links?.youtube, 'youtube'),
    discord: safeNormalizeProfileHandle(links?.discord, 'discord'),
  };
}

export interface ProfileLinkDisplayItem {
  key: string;
  label: string;
  display: string;
  href: string;
  kind: ProfileLinkKind;
}

export function profileLinkDisplayItems(
  links?: Record<string, string> | null
): ProfileLinkDisplayItem[] {
  if (!links) return [];

  return PROFILE_LINK_DISPLAY_FIELDS.flatMap((field) => {
    const value = field.resolveValue(links);
    if (!value?.trim()) return [];

    try {
      const href = buildProfileLinkUrl(value, field.kind);
      const display =
        field.kind === 'website'
          ? normalizeWebsiteForDisplay(value)
          : value.replace(/^@/, '');

      return [
        {
          key: field.key,
          label: field.label,
          display,
          href,
          kind: field.kind,
        },
      ];
    } catch {
      if (field.kind === 'website') return [];

      try {
        const stored = value.trim().replace(/^@/, '');
        const href = buildProfileLinkUrlFromStored(
          stored,
          field.kind as Exclude<ProfileLinkKind, 'website'>
        );
        return [
          {
            key: field.key,
            label: field.label,
            display: stored,
            href,
            kind: field.kind,
          },
        ];
      } catch {
        return [];
      }
    }
  });
}
