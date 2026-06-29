import { redirect } from 'next/navigation';
import { standingPath } from '@/lib/profile-social-standings';
import { resolveAccountId } from '@/lib/resolve-account';

type StandingOverlayRedirectProps = {
  params: Promise<{ accountId: string }>;
};

export default async function StandingOverlayRedirect({
  params,
}: StandingOverlayRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(standingPath(accountId, 'incoming'));
}
