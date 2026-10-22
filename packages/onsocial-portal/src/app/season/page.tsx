import { redirect } from 'next/navigation';
import { getPublicAppRallyUrl } from '@/lib/portal-config';

/** Public rally lives in the app. Settlement stays at /season/admin. */
export default function SeasonPage() {
  redirect(getPublicAppRallyUrl());
}
