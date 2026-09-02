import type { Metadata } from 'next';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { displayName, normalizeProfileTags } from '@/lib/profile-display';
import { fetchPublicPageData, resolvePageAvatarMode } from '@/lib/page-data';
import type { PageDrawerMeta } from '@/lib/page-drawer-meta';
import { readPageHeroSourceExplicit } from '@/lib/page-face';
import { resolveAccountId, resolveAccountPage } from '@/lib/resolve-account';
import { loadProfileShell } from '@/lib/profile-shell';
import { fetchProfileSignals } from '@/lib/profile-signals';
import {
  loadPortfolioDaoContextWithProfile,
  resolveDaoPortfolioSummary,
} from '@/lib/load-dao-page';
import { PortfolioActivateStrip } from '@/components/portfolio/portfolio-activate-strip';
import { PortfolioDaoOrgChrome } from '@/components/portfolio/portfolio-dao-org-chrome';
import { PortfolioDeferredShelf } from '@/components/portfolio/portfolio-deferred-shelf';
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
  // Hero-critical path only — drawer meta, guild rows, and peeks stream via
  // the deferred shelf Suspense boundary after first paint.
  const shellPromise = loadProfileShell(accountId);
  const [shell, signals, daoContext] = await Promise.all([
    shellPromise,
    fetchProfileSignals(accountId),
    shellPromise.then((profileShell) =>
      loadPortfolioDaoContextWithProfile(accountId, profileShell)
    ),
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
  const drawerTags = normalizeProfileTags(shell?.tags);
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
    tags: drawerTags,
  };
  const daoIncomingStanding = daoEntity.isDao
    ? (signals?.standingCount ?? data.stats.standingCount ?? 0)
    : 0;

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
        profileKind={shell?.kind ?? null}
        avatarMedia={shell?.avatarMedia ?? null}
        bannerMedia={shell?.bannerMedia ?? null}
        committedAvatarMode={committedAvatarMode}
        committedHeroSource={committedHeroSource}
        initialAvatarMode={avatarMode}
        config={data.config}
        stats={data.stats}
        profileName={shell?.name ?? daoPage?.branding.name}
        bio={portfolioBio}
        profileLinks={shell?.links ?? null}
        drawerMeta={drawerMeta}
        incomingStandingCount={daoIncomingStanding}
        deferredShelf={
          <PortfolioDeferredShelf
            accountId={accountId}
            drawerName={name}
            drawerTags={drawerTags}
            guildCountHint={data.stats.groupCount ?? 0}
            postCountHint={postCount}
          />
        }
      >
        <PortfolioIdentity
          accountId={accountId}
          profileName={shell?.name ?? daoPage?.branding.name}
          location={shell?.location}
          bio={portfolioBio}
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
        <PortfolioLinks links={shell?.links} />
      </PortfolioShellRoot>
    </>
  );
}
