import { redirect } from 'next/navigation';
import { portfolioFeedPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type FeedRedirectProps = {
  params: Promise<{ accountId: string }>;
};

/** Hard refresh / shared `/feed` link — opens the portfolio page drawer. */
export default async function FeedPage({ params }: FeedRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioFeedPath(accountId));
}
