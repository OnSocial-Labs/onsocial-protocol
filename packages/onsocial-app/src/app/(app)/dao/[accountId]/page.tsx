import { permanentRedirect } from 'next/navigation';
import { isValidProtocolDaoAccountId } from '@/features/protocol/dao-accounts';
import { daoPath } from '@/lib/app-routes';

export const dynamic = 'force-dynamic';

type DaoPageProps = {
  params: Promise<{ accountId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Legacy `/dao/[accountId]` — permanently redirects to `/@accountId`.
 * Preserves proposal / status / search query for overlay deep-links.
 */
export default async function DaoPage({ params, searchParams }: DaoPageProps) {
  const { accountId: raw } = await params;
  const accountId = decodeURIComponent(raw).trim().toLowerCase();
  if (!isValidProtocolDaoAccountId(accountId)) {
    permanentRedirect('/daos');
  }

  const search = (await searchParams) ?? {};
  const paramsOut = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry) paramsOut.append(key, entry);
      }
    } else if (value) {
      paramsOut.set(key, value);
    }
  }
  const query = paramsOut.toString();
  const dest = daoPath(accountId);
  permanentRedirect(query ? `${dest}?${query}` : dest);
}
