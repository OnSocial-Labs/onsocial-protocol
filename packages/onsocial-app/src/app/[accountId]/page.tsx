import type { Metadata } from 'next';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { displayName } from '@/lib/profile-display';
import { fetchPublicPageData, resolvePageAvatarMode } from '@/lib/page-data';
import { readPageHeroSourceExplicit } from '@/lib/page-face';
import { resolveAccountId, resolveAccountPage } from '@/lib/resolve-account';
import { loadProfileShell } from '@/lib/profile-shell';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { fetchProfileGuilds } from '@/lib/profile-guilds';
import { fetchPageDrawerMeta } from '@/lib/fetch-page-drawer-meta';
import {
  loadPortfolioDaoContextWithProfile,
  resolveDaoPortfolioSummary,
} from '@/lib/load-dao-page';
import { PortfolioActivateStrip } from '@/components/portfolio/portfolio-activate-strip';
import { PortfolioDaoOrgChrome } from '@/components/portfolio/portfolio-dao-org-chrome';
import { PortfolioDeferredShelf } from '@/components/portfolio/portfolio-deferred-shelf';
import { PortfolioIdentity } from '@/components/portfolio/portfolio-identity';
import { PortfolioLinks } from '@/components/portfolio/portfolio-links';
import { PortfolioShellRoot } from '@/components/portfolio/portfolio-shell-root';
import { PortfolioProfileSeed } from '@/components/portfolio/portfolio-profile-seed';
import { PortfolioSignalsShell } from '@/components/portfolio/portfolio-signals-shell';
import { PortfolioStatsRow } from '@/components/portfolio/portfolio-stats-row';

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
  const [shell, data, daoContext] = await Promise.all([
    shellPromise,
    fetchPublicPageData(accountId),
    shellPromise.then((profileShell) =>
      loadPortfolioDaoContextWithProfile(accountId, profileShell)
    ),
  ]);
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
  // Hero-critical path only — drawer peeks stream via Suspense.
  const shellPromise = loadProfileShell(accountId);
  const [shell, signals, guilds, drawerMetaBase, daoContext] = await Promise.all([
    shellPromise,
    fetchProfileSignals(accountId),
    fetchProfileGuilds(accountId),
    fetchPageDrawerMeta(accountId, {
      profileName: accountId,
      profileTags: [],
      guildCount: data.stats.groupCount ?? 0,
      postCount: data.stats.postCount ?? 0,
    }),
    shellPromise.then((profileShell) =>
      loadPortfolioDaoContextWithProfile(accountId, profileShell)
    ),
  ]);
  const { entity: daoEntity, page: daoPage } = daoContext;
  const portfolioBio = resolveDaoPortfolioSummary({
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
  const drawerMeta = {
    ...drawerMetaBase,
    name,
    tags: shell?.tags?.length ? shell.tags : drawerMetaBase.tags,
    guildCount: Math.max(guilds.length, drawerMetaBase.guildCount ?? 0),
    postCount: Math.max(postCount, drawerMetaBase.postCount ?? 0),
  };

  return (
    <>
      <PortfolioProfileSeed
        accountId={accountId}
        displayName={name}
        avatarUrl={shell?.avatarUrl ?? daoPage?.branding.avatarUrl ?? null}
        counts={{
          incoming: signals?.standingCount ?? 0,
          outgoing: signals?.standingWithCount ?? 0,
          mutual: signals?.mutualStandingCount ?? 0,
        }}
      />
      <PortfolioShellRoot
        mood={mood}
        pageAccountId={accountId}
        isDao={daoEntity.isDao}
        avatarMedia={shell?.avatarMedia ?? null}
        bannerMedia={shell?.bannerMedia ?? null}
        committedAvatarMode={committedAvatarMode}
        committedHeroSource={committedHeroSource}
        initialAvatarMode={avatarMode}
        config={data.config}
        stats={data.stats}
        guilds={guilds}
        profileName={shell?.name ?? daoPage?.branding.name}
        bio={portfolioBio}
        profileLinks={shell?.links ?? null}
        drawerMeta={drawerMeta}
        deferredShelf={
          <PortfolioDeferredShelf accountId={accountId} />
        }
      >
        <PortfolioIdentity
          accountId={accountId}
          profileName={shell?.name ?? daoPage?.branding.name}
          bio={portfolioBio}
          tagline={tagline}
          avatarUrl={shell?.avatarUrl ?? daoPage?.branding.avatarUrl}
          mood={mood}
          isDao={daoEntity.isDao}
          kindLabel={daoEntity.kindLabel}
        />

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

        {signals ? (
          <PortfolioSignalsShell accountId={accountId} signals={signals} />
        ) : (
          <PortfolioStatsRow accountId={accountId} stats={data.stats} />
        )}
        <PortfolioLinks links={shell?.links} />
      </PortfolioShellRoot>
    </>
  );
}
