const LISTING_NAME_MAX = 32;

export type ListingHrefError = { error: string; code: 'INVALID_LISTING' };

export function normalizeListingName(raw: unknown): string | ListingHrefError {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name)
    return { error: 'name is required to list', code: 'INVALID_LISTING' };
  if (name.length > LISTING_NAME_MAX) {
    return {
      error: `name must be ${LISTING_NAME_MAX} characters or fewer`,
      code: 'INVALID_LISTING',
    };
  }
  return name;
}

export function normalizeHttpsUrl(
  raw: unknown,
  field: 'href' | 'iconUrl'
): string | '' | ListingHrefError {
  if (raw == null || raw === '') return '';
  if (typeof raw !== 'string') {
    return { error: `${field} must be an https URL`, code: 'INVALID_LISTING' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: `${field} must be an https URL`, code: 'INVALID_LISTING' };
  }
  if (url.protocol !== 'https:') {
    return { error: `${field} must be an https URL`, code: 'INVALID_LISTING' };
  }
  if (!url.hostname) {
    return { error: `${field} must be an https URL`, code: 'INVALID_LISTING' };
  }
  if (url.username || url.password) {
    return { error: `${field} must be an https URL`, code: 'INVALID_LISTING' };
  }
  return url.toString();
}

export function listingOrigin(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || !url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeListingInput(body: {
  name?: unknown;
  iconUrl?: unknown;
  href?: unknown;
  listed?: unknown;
}):
  | {
      name: string | null;
      iconUrl: string | null;
      href: string | null;
      listed: boolean;
    }
  | ListingHrefError {
  const listed = Boolean(body.listed);
  const nameRaw =
    body.name == null || body.name === ''
      ? ''
      : normalizeListingName(body.name);
  if (typeof nameRaw === 'object') return nameRaw;

  const hrefRaw = normalizeHttpsUrl(body.href, 'href');
  if (typeof hrefRaw === 'object') return hrefRaw;

  const iconRaw = normalizeHttpsUrl(body.iconUrl, 'iconUrl');
  if (typeof iconRaw === 'object') return iconRaw;

  if (listed) {
    if (!nameRaw) {
      return { error: 'name is required to list', code: 'INVALID_LISTING' };
    }
    if (!hrefRaw) {
      return { error: 'href is required to list', code: 'INVALID_LISTING' };
    }
  }

  return {
    name: nameRaw || null,
    iconUrl: iconRaw || null,
    href: hrefRaw || null,
    listed,
  };
}
