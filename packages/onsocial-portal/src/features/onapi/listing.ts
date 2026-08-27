const LISTING_NAME_MAX = 32;

export type ListingDraft = {
  name: string;
  iconUrl: string;
  href: string;
  listed: boolean;
};

export function listingFromApp(app: {
  name?: string | null;
  iconUrl?: string | null;
  href?: string | null;
  listed?: boolean;
}): ListingDraft {
  return {
    name: app.name?.trim() ?? '',
    iconUrl: app.iconUrl?.trim() ?? '',
    href: app.href?.trim() ?? '',
    listed: Boolean(app.listed),
  };
}

export function listingDraftsEqual(a: ListingDraft, b: ListingDraft): boolean {
  return (
    a.name === b.name &&
    a.iconUrl === b.iconUrl &&
    a.href === b.href &&
    a.listed === b.listed
  );
}

function httpsUrlError(raw: string, field: 'href' | 'iconUrl'): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${field} must be an https URL`;
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    return `${field} must be an https URL`;
  }
  return null;
}

export function listingDraftError(draft: ListingDraft): string | null {
  const name = draft.name.trim();
  if (name.length > LISTING_NAME_MAX) {
    return `name must be ${LISTING_NAME_MAX} characters or fewer`;
  }
  const hrefError = httpsUrlError(draft.href.trim(), 'href');
  if (hrefError) return hrefError;
  const iconError = httpsUrlError(draft.iconUrl.trim(), 'iconUrl');
  if (iconError) return iconError;
  if (draft.listed) {
    if (!name) return 'name is required to list';
    if (!draft.href.trim()) return 'href is required to list';
  }
  return null;
}

export function listingPublishToast(
  wasListed: boolean,
  nextListed: boolean
): 'onTheBoard' | 'offTheBoard' | 'listingSaved' {
  if (nextListed && !wasListed) return 'onTheBoard';
  if (!nextListed && wasListed) return 'offTheBoard';
  return 'listingSaved';
}
