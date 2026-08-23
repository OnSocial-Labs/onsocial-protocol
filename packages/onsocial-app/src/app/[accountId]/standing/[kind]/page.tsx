import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingKindRedirectProps = {
  params: Promise<{ accountId: string; kind: string }>;
};

/**
 * Hard refresh / shared link — standing is a face peek (overlay-only).
 * Soft nav still opens the glass sheet via `@overlay/(.)standing`.
 */
export default async function StandingKindPage({
  params,
}: StandingKindRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
