import { redirect } from 'next/navigation';
import { getPublicAppBoostUrl } from '@/lib/portal-config';

/** Old ranking URL. The board lives in the app; this opens Boost. */
export default function RetiredBoostLeaderboardPage() {
  redirect(getPublicAppBoostUrl());
}
