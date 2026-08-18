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
import { PortfolioActivateStrip } from '@/components/portfolio/portfolio-activate-strip';
import { PortfolioDeferredShelf } from '@/components/portfolio/portfolio-deferred-shelf';
import { PortfolioIdentity } from '@/components/portfolio/portfolio-identity';
import { PortfolioLinks } from '@/components/portfolio/portfolio-links';
import { PortfolioShellRoot } from '@/components/portfolio/portfolio-shell-root';
import { PortfolioProfileSeed } from '@/components/portfolio/portfolio-profile-seed';
import { PortfolioSignalsShell } from '@/components/portfolio/portfolio-signals-shell';
import { PortfolioStatsRow } from '@/components/portfolio/portfolio-stats-row';
import { resolvePortfolioDaoEntity } from '@/lib/portfolio-dao-entity';

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
  const [shell, data] = await Promise.all([
    loadProfileShell(accountId),
    fetchPublicPageData(accountId),
  ]);
  const titleLabel = displayName(accountId, shell?.name ?? undefined);
  const description =
    data?.config.tagline?.trim() ||
    shell?.bio?.trim() ||
    `Public page for ${accountId}.`;

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
  const [shell, signals, guilds, drawerMetaBase, daoEntity] = await Promise.all([
    loadProfileShell(accountId),
    fetchProfileSignals(accountId),
    fetchProfileGuilds(accountId),
    fetchPageDrawerMeta(accountId, {
      profileName: accountId,
      profileTags: [],
      guildCount: data.stats.groupCount ?? 0,
      postCount: data.stats.postCount ?? 0,
    }),
    resolvePortfolioDaoEntity(accountId),
  ]);
  const name = displayName(accountId, shell?.name ?? undefined);
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
        avatarUrl={shell?.avatarUrl ?? null}
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
        profileName={shell?.name}
        bio={shell?.bio}
        profileLinks={shell?.links ?? null}
        drawerMeta={drawerMeta}
        deferredShelf={
          <PortfolioDeferredShelf accountId={accountId} />
        }
      >
        <PortfolioIdentity
          accountId={accountId}
          profileName={shell?.name}
          bio={shell?.bio}
          tagline={tagline}
          avatarUrl={shell?.avatarUrl}
          mood={mood}
          isDao={daoEntity.isDao}
          kindLabel={daoEntity.kindLabel}
          workspaceHref={daoEntity.workspaceHref}
        />

        <PortfolioActivateStrip
          pageAccountId={accountId}
          activated={Boolean(data.activated)}
        />

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
