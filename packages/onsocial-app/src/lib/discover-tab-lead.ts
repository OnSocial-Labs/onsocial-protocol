import type { DiscoverFaceCounts, DiscoverFaceFilter } from '@onsocial/sdk';
import { profileIdentityTopicLabel } from '@/lib/profile-identity-topics';

/** Compact counts for Discover tab lead lines. */
export function formatDiscoverTabCount(count: number): string {
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return '0';

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits:
      Math.abs(numericCount) >= 1000 && Math.abs(numericCount) < 100000 ? 1 : 0,
    notation: Math.abs(numericCount) >= 1000 ? 'compact' : 'standard',
  }).format(numericCount);
}

function faceLeadNoun(face: DiscoverFaceFilter): string {
  if (face === 'people') return 'people';
  if (face === 'orgs') return 'orgs';
  if (face === 'daos') return 'DAOs';
  if (face === 'offers') return 'offers';
  if (face === 'hiring') return 'hiring';
  return 'profiles';
}

function faceLeadCount(
  faceCounts: Partial<DiscoverFaceCounts> | null | undefined,
  face: DiscoverFaceFilter
): string | null {
  const raw = faceCounts?.[face];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
  return formatDiscoverTabCount(raw);
}

/**
 * One hint line for Profiles Discover — count for the active face, plus
 * craft / industry when set. Chips stay label-only; this matches Guilds /
 * Hubs / DAOs lead chrome.
 */
export function discoverProfilesLead(
  faceCounts: Partial<DiscoverFaceCounts> | null | undefined,
  face: DiscoverFaceFilter = 'all',
  industry = '',
  craft = ''
): string {
  const sector = industry.trim();
  const craftLabel = craft.trim()
    ? profileIdentityTopicLabel(craft.trim())
    : '';
  const count = faceLeadCount(faceCounts, face);
  const noun = faceLeadNoun(face);
  const head = count ? `${count} ${noun}` : noun === 'profiles' ? 'Profiles' : noun.charAt(0).toUpperCase() + noun.slice(1);

  if (craftLabel) {
    const peopleCount = faceLeadCount(faceCounts, 'people');
    const peopleHead = peopleCount
      ? `${peopleCount} people`
      : 'People';
    return `${peopleHead} · ${craftLabel}`;
  }
  if (face === 'hiring' && sector) return `${head} · ${sector}`;
  if (face === 'orgs' && sector) return `${head} · ${sector}`;
  if (face === 'daos' && sector) return `${head} · ${sector}`;
  if (face === 'all' && sector) {
    const allCount = faceLeadCount(faceCounts, 'all');
    const allHead = allCount ? `${allCount} profiles` : 'Profiles';
    return `${allHead} · ${sector}`;
  }
  return head;
}

export function discoverDaosLead(
  total: number,
  _query: string,
  syncing: boolean
): string {
  if (syncing && total === 0) return 'Finding NEAR DAOs…';
  if (total > 0) return `${total.toLocaleString()} NEAR DAOs`;
  return 'NEAR DAOs';
}

export function discoverGuildsLead(
  _query: string,
  topicLabel: string | null
): string {
  if (topicLabel) return `Guilds · ${topicLabel}`;
  return 'Public guilds';
}

export function discoverHubsLead(
  _query: string,
  categoryLabel: string | null
): string {
  if (categoryLabel) return `Hubs · ${categoryLabel}`;
  return 'Creator hubs';
}

export function discoverTopicsLead(filterPrefix: string): string {
  const prefix = filterPrefix.trim();
  if (prefix) return `Topics · #${prefix}`;
  return 'Trending topics';
}

export function discoverTickersLead(filterPrefix: string): string {
  const prefix = filterPrefix.trim();
  if (prefix) return `Tickers · $${prefix.toUpperCase()}`;
  return 'Trending tickers';
}

export function discoverTrendingLead(): string {
  return "What's moving";
}

/** Profiles peek heading on Moving — names the face / industry filter. */
export function discoverTrendingProfilesHeading(
  face: DiscoverFaceFilter = 'all',
  industry = ''
): string {
  const sector = industry.trim();
  if (face === 'offers') return 'Offers';
  if (face === 'hiring') return sector ? `Hiring · ${sector}` : 'Hiring';
  if (face === 'orgs') return sector ? `Orgs · ${sector}` : 'Orgs';
  if (face === 'daos') return sector ? `DAOs · ${sector}` : 'DAOs';
  if (face === 'people') return 'People';
  if (sector) return `Active · ${sector}`;
  return 'Active';
}
