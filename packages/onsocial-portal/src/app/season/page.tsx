import { redirect } from 'next/navigation';
import { getPublicAppRallyUrl } from '@/lib/portal-config';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';

/** Public rally lives in the app. Settlement stays at /season/admin. */
export default async function SeasonPage() {
  const network = await getRequestPortalNetwork();
  redirect(getPublicAppRallyUrl(null, null, network));
}
