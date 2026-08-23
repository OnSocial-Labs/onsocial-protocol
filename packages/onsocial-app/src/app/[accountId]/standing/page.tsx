import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingRedirectProps = {
  params: Promise<{ accountId: string }>;
};

/** Bare `/standing` — overlay-only; hard refresh lands on the face. */
export default async function StandingRedirect({
  params,
}: StandingRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
