import { redirect } from 'next/navigation';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type ReputationRedirectProps = {
  params: Promise<{ accountId: string }>;
};

/**
 * Old `/reputation` links return to the profile. The score opens a facts drawer on the face.
 */
export default async function ReputationPage({
  params,
}: ReputationRedirectProps) {
  const accountId = await resolveAccountId(params);
  redirect(portfolioPath(accountId));
}
