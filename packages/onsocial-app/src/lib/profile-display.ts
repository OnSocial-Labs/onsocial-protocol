export function fallbackLabel(accountId: string): string {
  return accountId.replace(/\.testnet$|\.near$/, '');
}

export function displayName(accountId: string, profileName?: string): string {
  const name = profileName?.trim();
  return name || fallbackLabel(accountId);
}

export function initials(label: string): string {
  return label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
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
