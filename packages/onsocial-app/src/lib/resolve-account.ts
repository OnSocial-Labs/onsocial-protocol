import { notFound } from 'next/navigation';
import { normalizeAccountRoute } from '@/lib/account-route';
import { fetchPublicPageData, type PublicPageData } from '@/lib/page-data';

type AccountParams = Promise<{
  accountId: string;
}>;

export async function resolveAccountId(params: AccountParams): Promise<string> {
  const { accountId: routeSegment } = await params;
  const accountId = normalizeAccountRoute(routeSegment);

  if (!accountId) {
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
