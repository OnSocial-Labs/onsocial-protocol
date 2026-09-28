import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PortfolioAccountFace } from '@/components/portfolio/portfolio-account-face';
import {
  ProtocolFacePair,
  ProtocolFacePairFallback,
} from '@/components/portfolio/protocol-face-pair';
import { displayName } from '@/lib/profile-display';
import { fetchPublicPageData } from '@/lib/page-data';
import { resolveAccountId, resolveAccountPage } from '@/lib/resolve-account';
import { loadProfileShell } from '@/lib/profile-shell';
import { resolveDaoPortfolioSummary } from '@/lib/load-dao-page';
import { loadPortfolioHeroDaoContext } from '@/lib/portfolio-hero-path';
import { resolveProtocolFaceDaoKind } from '@/lib/portfolio-dao-entity';
import { protocolFacePairSibling } from '@/lib/protocol-face-pair';

export const dynamic = 'force-dynamic';

type AccountPageProps = {
  params: Promise<{
    accountId: string;
  }>;
  searchParams?: Promise<{
    avatar?: string | string[];
    avatarMode?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: AccountPageProps): Promise<Metadata> {
  const accountId = await resolveAccountId(params);
  const shellPromise = loadProfileShell(accountId);
  const [shell, data] = await Promise.all([
    shellPromise,
    fetchPublicPageData(accountId),
  ]);
  const daoContext = await loadPortfolioHeroDaoContext(accountId, shell);
  const titleLabel = displayName(
    accountId,
    shell?.name ?? daoContext.page?.branding.name ?? undefined
  );
  const description =
    resolveDaoPortfolioSummary({
      tagline: data?.config.tagline,
      shellBio: shell?.bio,
      daoPage: daoContext.page,
    }) ?? `Public page for ${accountId}.`;

  return {
    title: `${titleLabel} • OnSocial`,
    description,
    openGraph: {
      title: `${titleLabel} • OnSocial`,
      description,
      siteName: 'OnSocial',
      type: 'profile',
    },
  };
}

export default async function AccountPage({
  params,
  searchParams,
}: AccountPageProps) {
  const { accountId } = await resolveAccountPage(params);
  const search = await searchParams;
  const sibling = protocolFacePairSibling(accountId);
  const kind = resolveProtocolFaceDaoKind(accountId);
  if (!sibling || !kind) {
    return (
      <PortfolioAccountFace accountId={accountId} search={search} strict />
    );
  }

  const activeFace = (
    <PortfolioAccountFace
      accountId={accountId}
      search={search}
      strict
      showEssayLeave
    />
  );
  const siblingFace = (
    <Suspense fallback={<ProtocolFacePairFallback />}>
      <PortfolioAccountFace
        accountId={sibling}
        search={search}
        strict={false}
        showEssayLeave={false}
        honorDeepLinks={false}
      />
    </Suspense>
  );

  return (
    <ProtocolFacePair
      activeAccountId={accountId}
      governance={kind === 'governance' ? activeFace : siblingFace}
      treasury={kind === 'treasury' ? activeFace : siblingFace}
    />
  );
}
