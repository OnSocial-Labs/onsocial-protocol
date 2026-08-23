import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type EndorsementsRedirectProps = {
  params: Promise<{ accountId: string }>;
};

/**
 * Hard refresh / shared link — endorsements are a face peek (overlay-only).
 * Soft nav still opens the glass sheet via `@overlay/(.)endorsements`.
 */
export default async function EndorsementsPage({
  params,
}: EndorsementsRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
