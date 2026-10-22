import { redirect } from 'next/navigation';
import { getPublicAppRallyUrl } from '@/lib/portal-config';

/** Genesis rally archive opens in the app. */
export default function SeasonZeroPage() {
  redirect(getPublicAppRallyUrl(null, 'season-zero'));
}
