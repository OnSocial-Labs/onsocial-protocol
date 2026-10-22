import { redirect } from 'next/navigation';
import { getPublicAppRallyUrl } from '@/lib/portal-config';

/** A season id opens that rally in the app. /season/admin stays on the portal. */
export default async function SeasonByIdPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  redirect(getPublicAppRallyUrl(null, decodeURIComponent(seasonId)));
}
