import ProfilePage from '@/features/profile/profile-page';
import {
  isValidPortalAccountId,
  loadPortalProfileShell,
} from '@/lib/portal-profile-server';

function decodeRouteAccountId(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId: accountIdParam } = await params;
  const accountId = decodeRouteAccountId(accountIdParam);
  const initialShell = isValidPortalAccountId(accountId)
    ? await loadPortalProfileShell(accountId)
    : null;

  return <ProfilePage accountId={accountIdParam} initialShell={initialShell} />;
}
