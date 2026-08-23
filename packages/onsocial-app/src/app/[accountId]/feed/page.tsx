import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type FeedRedirectProps = {
  params: Promise<{ accountId: string }>;
};

/**
 * Hard refresh / shared link — feed is a face peek (overlay-only).
 * Soft nav still opens the glass sheet via `@overlay/(.)feed`.
 */
export default async function FeedPage({ params }: FeedRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
