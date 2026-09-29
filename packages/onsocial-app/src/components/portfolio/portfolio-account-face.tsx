import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { displayName } from '@/lib/profile-display';
import { fetchPublicPageData, resolvePageAvatarMode } from '@/lib/page-data';
import type { PageDrawerMeta } from '@/lib/page-drawer-meta';
import { readPageHeroSourceExplicit } from '@/lib/page-face';
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
import { ProtocolFacePairFallback } from '@/components/portfolio/protocol-face-pair';

export type PortfolioAccountFaceSearch = {
  avatar?: string | string[];
  avatarMode?: string | string[];
};

/**
 * One portfolio face. Protocol Governance and Treasury each render one of
 * these inside the pair pager; every other account renders it alone.
 */
export async function PortfolioAccountFace({
  accountId,
  search,
  strict = true,
  showEssayLeave = true,
  honorDeepLinks = true,
}: {
  accountId: string;
  search?: PortfolioAccountFaceSearch;
  /** Missing page data 404s the route. The sibling face fails quietly. */
  strict?: boolean;
  showEssayLeave?: boolean;
  /** `?kind=` / `?proposal=` open Proposals on the landing face only. */
  honorDeepLinks?: boolean;
}) {
  const data = await fetchPublicPageData(accountId);
  if (!data) {
    if (strict) notFound();
    return <ProtocolFacePairFallback />;
  }

  const tagline = data.config.tagline?.trim();
  const mood = resolvePortfolioMood(data.config);
  const committedAvatarMode = resolvePageAvatarMode(data.config, null);
  const committedHeroSource = readPageHeroSourceExplicit(data.config);
  const avatarMode = resolvePageAvatarMode(
    data.config,
    search?.avatarMode ?? search?.avatar ?? null
  );
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
      {showEssayLeave ? <PortfolioEssayLeave accountId={accountId} /> : null}
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
            honorDeepLinks={honorDeepLinks}
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
        <PortfolioLinks
          links={shell?.links}
          notes={data.config.linkNotes}
          lines={data.config.linkLines}
          images={data.config.linkImages}
        />
      </PortfolioShellRoot>
    </>
  );
}
