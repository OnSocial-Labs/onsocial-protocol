import type { DiscoverFaceFilter } from '@onsocial/sdk';
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

/**
 * One hint line per Discover tab. Names the section / count / active filter.
 * Do not echo the query — it's already in the search field. Lists, chips,
 * and peeks render only when they have something to show.
 */
export function discoverProfilesLead(
  discoverableTotal: number | null | undefined,
  _query?: string,
  face: DiscoverFaceFilter = 'all',
  industry = '',
  craft = ''
): string {
  const sector = industry.trim();
  const craftLabel = craft.trim()
    ? profileIdentityTopicLabel(craft.trim())
    : '';
  if (craftLabel) return `People · ${craftLabel}`;
  if (face === 'hiring') return sector ? `Hiring · ${sector}` : 'Hiring';
  if (face === 'orgs') return sector ? `Orgs · ${sector}` : 'Orgs';
  if (face === 'people') return 'People';
  if (sector) return `Profiles · ${sector}`;
  if (typeof discoverableTotal === 'number' && discoverableTotal > 0) {
    return `${formatDiscoverTabCount(discoverableTotal)} profiles`;
  }
  return 'Profiles';
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

/** Quiet stand hint — Profiles list and Moving Active share this line. */
export const DISCOVER_CONNECT_HINT = 'Connect to stand with profiles.';

/** Profiles peek heading on Moving — names the face / industry filter. */
export function discoverTrendingProfilesHeading(
  face: DiscoverFaceFilter = 'all',
  industry = ''
): string {
  const sector = industry.trim();
  if (face === 'hiring') return sector ? `Hiring · ${sector}` : 'Hiring';
  if (face === 'orgs') return sector ? `Orgs · ${sector}` : 'Orgs';
  if (face === 'people') return 'People';
  if (sector) return `Active · ${sector}`;
  return 'Active';
}
