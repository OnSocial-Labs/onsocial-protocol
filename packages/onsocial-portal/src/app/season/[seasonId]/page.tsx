import { redirect } from 'next/navigation';
import { getPublicAppRallyUrl } from '@/lib/portal-config';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';

/** A season id opens that rally in the app. /season/admin stays on the portal. */
export default async function SeasonByIdPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  const network = await getRequestPortalNetwork();
  redirect(getPublicAppRallyUrl(null, decodeURIComponent(seasonId), network));
}
