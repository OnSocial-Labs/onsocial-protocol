import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingRedirectProps = {
  params: Promise<{ accountId: string }>;
};

/** Bare `/standing` — same as kind routes: face only (sheet is soft-nav). */
export default async function StandingRedirect({ params }: StandingRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
