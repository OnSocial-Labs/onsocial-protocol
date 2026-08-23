import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type ReputationRedirectProps = {
  params: Promise<{ accountId: string }>;
};

/**
 * Hard refresh / shared link — reputation is a face peek (overlay-only).
 * Soft nav still opens the glass sheet via `@overlay/(.)reputation`.
 */
export default async function ReputationPage({
  params,
}: ReputationRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
