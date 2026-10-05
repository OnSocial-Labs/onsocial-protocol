import { redirect } from 'next/navigation';
import { endorsementsHardLoadPath } from '@/lib/overlay-routes';
import { resolveAccountId } from '@/lib/resolve-account';

type EndorsementsRedirectProps = {
  params: Promise<{ accountId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Hard refresh / shared link — endorsements is a face peek (overlay-only).
 * Soft nav still opens the glass sheet via `@overlay/(.)endorsements`.
 * Vouch deep links (`?endorsement=`, legacy portal `?endorsementId=`)
 * forward to the face so the focus sheet opens on the exact vouch.
 */
export default async function EndorsementsPage({
  params,
  searchParams,
}: EndorsementsRedirectProps) {
  const accountId = await resolveAccountId(params);
  const search = await searchParams;
  redirect(endorsementsHardLoadPath(accountId, search));
}
