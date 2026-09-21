import type { Metadata } from 'next';
import { Suspense } from 'react';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { displayName } from '@/lib/profile-display';
import { fetchPublicPageData, resolvePageAvatarMode } from '@/lib/page-data';
import type { PageDrawerMeta } from '@/lib/page-drawer-meta';
import { readPageHeroSourceExplicit } from '@/lib/page-face';
import { resolveAccountId, resolveAccountPage } from '@/lib/resolve-account';
import { loadProfileShell } from '@/lib/profile-shell';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { resolveDaoPortfolioSummary } from '@/lib/load-dao-page';
import {
  loadPortfolioHeroDaoContext,
  portfolioHeroAwaitsSignals,
} from '@/lib/portfolio-hero-path';
import { PortfolioActivateStrip } from '@/components/portfolio/portfolio-activate-strip';
import { PortfolioEssayLeave } from '@/components/portfolio/portfolio-essay-leave';
import { PortfolioDaoOrgChrome } from '@/components/portfolio/portfolio-dao-org-chrome';
import { PortfolioDeferredShelf } from '@/components/portfolio/portfolio-deferred-shelf';
import {
  PortfolioDeferredProfileSeed,
  PortfolioDeferredSignals,
} from '@/components/portfolio/portfolio-deferred-signals';
import { PortfolioEndorsementFocusHost } from '@/components/portfolio/portfolio-endorsement-focus-host';
import { PortfolioIdentity } from '@/components/portfolio/portfolio-identity';
import { PortfolioLinks } from '@/components/portfolio/portfolio-links';
import { PortfolioShellRoot } from '@/components/portfolio/portfolio-shell-root';
import { PortfolioProfileSeed } from '@/components/portfolio/portfolio-profile-seed';
import { PortfolioSignalsShell } from '@/components/portfolio/portfolio-signals-shell';

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
  const { accountId, data } = await resolveAccountPage(params);
  const tagline = data.config.tagline?.trim();
  const mood = resolvePortfolioMood(data.config);
  const search = await searchParams;
  const committedAvatarMode = resolvePageAvatarMode(data.config, null);
  const committedHeroSource = readPageHeroSourceExplicit(data.config);
  const avatarMode = resolvePageAvatarMode(
    data.config,
    search?.avatarMode ?? search?.avatar ?? null
  );
  // Hero: shell + page config. Org faces also wait for DAO chrome (and
  // signals for the logged-out stand count). Person signals stream below.
  const shell = await loadProfileShell(accountId);
  const [daoContext, signals] = await Promise.all([
    loadPortfolioHeroDaoContext(accountId, shell),
    portfolioHeroAwaitsSignals(accountId)
      ? fetchProfileSignals(accountId)
      : Promise.resolve(null),
  ]);
  const { entity: daoEntity, page: daoPage } = daoContext;
  const portfolioBio = resolveDaoPortfolioSummary({
    tagline,
    shellBio: shell?.bio,
    daoPage,
  });
  const name = displayName(
    accountId,
    shell?.name ?? daoPage?.branding.name ?? undefined
  );
  const postCount = Math.max(
    signals?.postCount ?? 0,
    data.stats.postCount ?? 0
  );
  const identityTopics = shell?.tags ?? [];
  const avatarUrl = shell?.avatarUrl ?? daoPage?.branding.avatarUrl ?? null;
  // Cheap SSR seed — joined/updated/scarce meta hydrates from the shelf.
  const drawerMeta: PageDrawerMeta = {
    name,
    joinedAt: null,
    updatedAt: null,
    updatedFields: [],
    postCount,
    guildCount: data.stats.groupCount ?? 0,
    scarceMintCount: 0,
    daoRoleLabels: [],
    tags: identityTopics,
  };
  const daoIncomingStanding = daoEntity.isDao
    ? (signals?.standingCount ?? data.stats.standingCount ?? 0)
    : 0;
  const seedCounts = {
    incoming: signals?.standingCount ?? 0,
    outgoing: signals?.standingWithCount ?? 0,
    mutual: signals?.mutualStandingCount ?? 0,
  };

  return (
    <>
      <PortfolioEssayLeave accountId={accountId} />
      {signals ? (
        <PortfolioProfileSeed
          accountId={accountId}
          displayName={name}
          avatarUrl={avatarUrl}
          counts={seedCounts}
        />
      ) : (
        <Suspense fallback={null}>
          <PortfolioDeferredProfileSeed
            accountId={accountId}
            displayName={name}
            avatarUrl={avatarUrl}
          />
        </Suspense>
      )}
      <PortfolioShellRoot
        mood={mood}
        pageAccountId={accountId}
        isDao={daoEntity.isDao}
        profileKind={shell?.kind ?? null}
        avatarMedia={shell?.avatarMedia ?? null}
        bannerMedia={shell?.bannerMedia ?? null}
        committedAvatarMode={committedAvatarMode}
        committedHeroSource={committedHeroSource}
        initialAvatarMode={avatarMode}
        config={data.config}
        stats={data.stats}
        profileName={shell?.name ?? daoPage?.branding.name}
        drawerMeta={drawerMeta}
        deferredShelf={
          <PortfolioDeferredShelf
            accountId={accountId}
            drawerName={name}
            drawerTags={identityTopics}
            guildCountHint={data.stats.groupCount ?? 0}
            postCountHint={postCount}
          />
        }
      >
        <PortfolioIdentity
          accountId={accountId}
          profileName={shell?.name ?? daoPage?.branding.name}
          location={shell?.location}
          industry={shell?.industry ?? daoPage?.branding.industry}
          bio={portfolioBio}
          aboutBio={
            daoEntity.isDao
              ? (daoPage?.branding.about ?? null)
              : (shell?.about ?? null)
          }
          fullBio={daoPage?.branding.purpose ?? daoPage?.configPurpose ?? null}
          lead={shell?.lead ?? daoPage?.branding.lead ?? null}
          tags={identityTopics}
          photoCount={
            daoEntity.isDao
              ? (daoPage?.branding.photos.length ?? shell?.photos.length ?? 0)
              : (shell?.photos.length ?? 0)
          }
          tagline={tagline}
          avatarUrl={shell?.avatarUrl ?? daoPage?.branding.avatarUrl}
          mood={mood}
          isDao={daoEntity.isDao}
          profileKind={shell?.kind ?? null}
          kindLabel={daoEntity.kindLabel}
          incomingStandingCount={daoIncomingStanding}
        />

        {daoEntity.isDao ? null : (
          <PortfolioEndorsementFocusHost accountId={accountId} mood={mood} />
        )}

        {daoEntity.isDao ? null : (
          <PortfolioActivateStrip
            pageAccountId={accountId}
            activated={Boolean(data.activated)}
          />
        )}

        {daoEntity.isDao ? (
          <PortfolioDaoOrgChrome
            daoAccountId={accountId}
            daoName={name}
            initialBranding={daoPage?.branding ?? null}
            configName={daoPage?.configName ?? null}
            configPurpose={daoPage?.configPurpose ?? null}
            configMetadata={daoPage?.configMetadata ?? ''}
          />
        ) : null}

        {signals && !daoEntity.isDao ? (
          <PortfolioSignalsShell accountId={accountId} signals={signals} />
        ) : null}
        {!signals ? (
          <Suspense fallback={null}>
            <PortfolioDeferredSignals accountId={accountId} />
          </Suspense>
        ) : null}
        <PortfolioLinks links={shell?.links} />
      </PortfolioShellRoot>
    </>
  );
}
