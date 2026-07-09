/**
 * Identity label for an account — always the full NEAR account id.
 * Do not strip `.near` / `.testnet`; the suffix is part of who they are.
 */
export function fallbackLabel(accountId: string): string {
  return accountId.trim();
}

/** Handle line as rendered on the portfolio page for a given mood. */
export function portfolioHandleForMood(
  accountId: string,
  moodId?: string | null
): string {
  if (moodId === 'terminal') {
    return `~/${accountId}`;
  }

  if (moodId === 'signature') {
    return `@${accountId.toLowerCase()}`;
  }

  return `@${accountId}`;
}

/** Quiet hint when the live page formats the handle differently. */
export function portfolioHandleHint(
  accountId: string,
  moodId?: string | null
): string | null {
  if (!moodId || moodId === 'protocol') {
    return null;
  }

  const moodHandle = portfolioHandleForMood(accountId, moodId);
  const editorHandle = `@${fallbackLabel(accountId)}`;

  if (moodHandle === editorHandle || moodHandle === `@${accountId}`) {
    return null;
  }

  return `Shows as ${moodHandle} on your page`;
}

export function displayName(accountId: string, profileName?: string): string {
  const name = profileName?.trim();
  return name || fallbackLabel(accountId);
}

/** Account drawer — primary line when viewing your own sheet. */
export function accountDrawerPrimaryLabel(
  accountId: string,
  profileName?: string
): string {
  const name = profileName?.trim();
  if (!name) {
    return 'You';
  }
  if (
    name.toLowerCase() === accountId.toLowerCase() ||
    name.toLowerCase() === fallbackLabel(accountId).toLowerCase()
  ) {
    return 'You';
  }
  return name;
}

export function initials(label: string): string {
  return label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

const PROFILE_MEDIA_CDN_BASE: Record<'mainnet' | 'testnet', string> = {
  mainnet: 'https://cdn.onsocial.id/ipfs',
  testnet: 'https://cdn.testnet.onsocial.id/ipfs',
};

function activeNearNetwork(): 'mainnet' | 'testnet' {
  return process.env.NEAR_NETWORK === 'mainnet' ||
    process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
    ? 'mainnet'
    : 'testnet';
}

/** Resolve chain-stored avatar/banner refs to a browser-loadable URL (Portal parity). */
export function resolveProfileMediaUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('ipfs://')) {
    const cid = trimmed.slice('ipfs://'.length).trim();
    if (!cid) {
      return null;
    }

    return `${PROFILE_MEDIA_CDN_BASE[activeNearNetwork()]}/${cid}`;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

export function normalizeLink(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const parsedUrl = new URL(candidate);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}

export interface ProfileLinkItem {
  label: string;
  url: string;
}

/** Accepts schema v1 link arrays and legacy `{ github: url }` maps from chain. */
export function normalizeProfileLinks(links: unknown): ProfileLinkItem[] {
  if (!links) {
    return [];
  }

  if (Array.isArray(links)) {
    return links.flatMap((entry) => {
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
  }

  if (typeof links === 'object') {
    return Object.entries(links as Record<string, unknown>).flatMap(
      ([key, value]) => {
        if (typeof value !== 'string' || !value.trim()) {
          return [];
        }

        const label = key.trim();
        if (!label) {
          return [];
        }

        return [
          {
            label: label.charAt(0).toUpperCase() + label.slice(1),
            url: value.trim(),
          },
        ];
      }
    );
  }

  return [];
}

export function normalizeProfileTags(tags: unknown): string[] {
  if (!tags) {
    return [];
  }

  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}
