import { redirect } from 'next/navigation';
import StandPage from '@/features/profile/stand-page';
import type { PortalStandKind } from '@/lib/portal-config';

const VALID_KINDS = new Set<PortalStandKind>([
  'incoming',
  'outgoing',
  'mutual',
]);

function decodeRouteAccountId(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function resolveStandKind(raw: string): PortalStandKind {
  if (raw === 'solidarity') return 'mutual';
  if (raw === 'standing' || raw === 'standings') return 'incoming';
  if (VALID_KINDS.has(raw as PortalStandKind)) return raw as PortalStandKind;
  return 'incoming';
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string; kind: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { accountId: accountIdParam, kind: kindParam } = await params;
  const query = await searchParams;
  const accountId = decodeRouteAccountId(accountIdParam);
  const standKind = resolveStandKind(kindParam);

  if (kindParam !== standKind) {
    const search = new URLSearchParams();
    if (query.q?.trim()) search.set('q', query.q.trim());
    const qs = search.toString();
    redirect(
      `/u/${encodeURIComponent(accountId)}/stand/${standKind}${
        qs ? `?${qs}` : ''
      }`
    );
  }

  return <StandPage accountId={accountIdParam} kind={standKind} q={query.q} />;
}
