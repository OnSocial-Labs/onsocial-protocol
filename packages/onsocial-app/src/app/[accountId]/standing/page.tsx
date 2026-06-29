import { redirect } from 'next/navigation';
import { standingPath } from '@/lib/profile-social-standings';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingRedirectProps = {
  params: Promise<{ accountId: string }>;
};

export default async function StandingRedirect({ params }: StandingRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(standingPath(accountId, 'incoming'));
}
