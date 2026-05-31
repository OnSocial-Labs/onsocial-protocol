import StandPage from '@/features/profile/stand-page';
import type { PortalStandKind } from '@/lib/portal-config';

const VALID_KINDS = new Set<PortalStandKind>([
  'incoming',
  'outgoing',
  'mutual',
]);

export default async function Page({
  params,
}: {
  params: Promise<{ accountId: string; kind: string }>;
}) {
  const { accountId, kind } = await params;
  const standKind = VALID_KINDS.has(kind as PortalStandKind)
    ? (kind as PortalStandKind)
    : 'incoming';

  return <StandPage accountId={accountId} kind={standKind} />;
}
