import { notFound, redirect } from 'next/navigation';
import { normalizeAccountRoute } from '@/lib/account-route';
import { fetchPublicPageData, type PublicPageData } from '@/lib/page-data';

type AccountParams = Promise<{
  accountId: string;
}>;

/** NEAR account shape — lowercase parts joined by . with inner - / _ only. */
const BARE_NEAR_ACCOUNT_PATTERN =
  /^([a-z\d]+([-_][a-z\d]+)*)(\.([a-z\d]+([-_][a-z\d]+)*))*$/;

/**
 * Top-level app routes. Route groups don't appear in URLs, so these share
 * depth with `/@alice` — intercepting overlays fire on URL shape and bind the
 * app segment (e.g. "home") as `accountId` when soft-navigating from them.
 */
const RESERVED_APP_SEGMENTS = new Set([
  'api',
  'apps',
  'collectibles',
  'collection',
  'dao',
  'daos',
  'discover',
  'drops',
  'embed',
  'groups',
  'handoff',
  'home',
  'leaderboard',
  'market',
  'messages',
  'notifications',
  'on',
  'protocol',
  'series',
]);

/**
 * True when a raw `[accountId]` segment is really an app route — i.e. the
 * render is an intercept misfire, not a pasted bare link. Real account routes
 * always carry the `@` prefix, and hard loads of these paths resolve to the
 * app route before `[accountId]` ever sees them.
 */
export function isInterceptMisfireSegment(segment: string): boolean {
  let bare: string;
  try {
    bare = decodeURIComponent(segment).trim().toLowerCase();
  } catch {
    return false;
  }
  if (!bare || bare.startsWith('@')) {
    return false;
  }
  return RESERVED_APP_SEGMENTS.has(bare);
}

export async function resolveAccountId(params: AccountParams): Promise<string> {
  const { accountId: routeSegment } = await params;
  const accountId = normalizeAccountRoute(routeSegment);

  if (!accountId) {
    // Rescue pasted bare links — /alice.near → /@alice.near.
    const bare = decodeURIComponent(routeSegment).trim().toLowerCase();
    if (
      bare.length >= 2 &&
      bare.length <= 64 &&
      BARE_NEAR_ACCOUNT_PATTERN.test(bare)
    ) {
      redirect(`/@${bare}`);
    }
    notFound();
  }

  return accountId;
}

export async function resolveAccountPage(
  params: AccountParams
): Promise<{ accountId: string; data: PublicPageData }> {
  const accountId = await resolveAccountId(params);
  const data = await fetchPublicPageData(accountId);

  if (!data) {
    notFound();
  }

  return { accountId, data };
}
