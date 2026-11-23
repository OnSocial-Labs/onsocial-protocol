import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DaosIndexPanel } from '@/features/protocol/daos-index-panel';
import {
  APP_DAOS_CREATE_PATH,
  DAOS_CREATE_QUERY,
} from '@/lib/app-routes';

export const metadata: Metadata = {
  title: 'DAOs • OnSocial',
  description: 'Your DAO memberships — create an org or open a portfolio.',
};

type DaosIndexPageProps = {
  searchParams?: Promise<{
    [DAOS_CREATE_QUERY]?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

export default async function DaosIndexPage({
  searchParams,
}: DaosIndexPageProps) {
  const params = await searchParams;
  const create = firstParam(params?.[DAOS_CREATE_QUERY]).toLowerCase();
  if (create === '1' || create === 'true') {
    redirect(APP_DAOS_CREATE_PATH);
  }

  return <DaosIndexPanel />;
}
