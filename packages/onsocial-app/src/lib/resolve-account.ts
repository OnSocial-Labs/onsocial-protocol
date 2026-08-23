import { notFound, redirect } from 'next/navigation';
import { normalizeAccountRoute } from '@/lib/account-route';
import { fetchPublicPageData, type PublicPageData } from '@/lib/page-data';

type AccountParams = Promise<{
  accountId: string;
}>;

/** NEAR account shape — lowercase parts joined by . with inner - / _ only. */
const BARE_NEAR_ACCOUNT_PATTERN =
  /^([a-z\d]+([-_][a-z\d]+)*)(\.([a-z\d]+([-_][a-z\d]+)*))*$/;

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
