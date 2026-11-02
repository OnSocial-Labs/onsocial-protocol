import { redirect } from 'next/navigation';
import { getPublicAppBoostUrl } from '@/lib/portal-config';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';

/** Old ranking URL. The board lives in the app; this opens Boost. */
export default async function RetiredBoostLeaderboardPage() {
  const network = await getRequestPortalNetwork();
  redirect(getPublicAppBoostUrl(null, network));
}
