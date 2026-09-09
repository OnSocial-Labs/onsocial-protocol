import { redirect } from 'next/navigation';
import { APP_DROP_CREATE_PATH } from '@/lib/app-routes';

type LegacyMarketCreateProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

/** Bookmarks to `/market/create` land on the Drops create place. */
export default async function LegacyMarketCreatePage({
  searchParams,
}: LegacyMarketCreateProps) {
  const resolved = (await searchParams) ?? {};
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    const first = firstParam(value);
    if (first) params.set(key, first);
  }
  const qs = params.toString();
  redirect(qs ? `${APP_DROP_CREATE_PATH}?${qs}` : APP_DROP_CREATE_PATH);
}
