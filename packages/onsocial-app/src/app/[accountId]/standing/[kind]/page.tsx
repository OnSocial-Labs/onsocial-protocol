import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingKindPageProps = {
  params: Promise<{
    accountId: string;
    kind: string;
  }>;
};

/**
 * Hard refresh / direct URL — no full-page standing shell.
 * Soft nav still opens the glass sheet via `@overlay/(.)standing`.
 */
export default async function StandingKindPage({ params }: StandingKindPageProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
