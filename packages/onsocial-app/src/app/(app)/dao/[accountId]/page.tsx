import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { DaoPortfolioPanel } from '@/features/protocol/dao-portfolio-panel';
import { isValidProtocolDaoAccountId } from '@/features/protocol/dao-accounts';
import { loadDaoPageData } from '@/lib/load-dao-page';

export const dynamic = 'force-dynamic';

type DaoPageProps = {
  params: Promise<{ accountId: string }>;
};

export async function generateMetadata({
  params,
}: DaoPageProps): Promise<Metadata> {
  const { accountId: raw } = await params;
  const accountId = decodeURIComponent(raw).trim().toLowerCase();
  if (!isValidProtocolDaoAccountId(accountId)) {
    return { title: 'DAO • OnSocial' };
  }
  const data = await loadDaoPageData(accountId);
  const title = data?.branding.name ?? accountId;
  const description =
    data?.branding.description?.trim() ||
    `OnSocial DAO page for ${accountId}.`;
  return {
    title: `${title} • OnSocial`,
    description,
  };
}

export default async function DaoPage({ params }: DaoPageProps) {
  const { accountId: raw } = await params;
  const accountId = decodeURIComponent(raw).trim().toLowerCase();
  if (!isValidProtocolDaoAccountId(accountId)) notFound();

  const data = await loadDaoPageData(accountId);
  if (!data) notFound();

  return (
    <Suspense fallback={null}>
      <DaoPortfolioPanel
        initialBranding={data.branding}
        configName={data.configName}
        configPurpose={data.configPurpose}
        configMetadata={data.configMetadata}
      />
    </Suspense>
  );
}
