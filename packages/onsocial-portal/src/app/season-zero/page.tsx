import { redirect } from 'next/navigation';
import { getPublicAppRallyUrl } from '@/lib/portal-config';
import { getRequestPortalNetwork } from '@/lib/portal-network-request';

/** Genesis rally archive opens in the app. */
export default async function SeasonZeroPage() {
  const network = await getRequestPortalNetwork();
  redirect(getPublicAppRallyUrl(null, 'season-zero', network));
}
