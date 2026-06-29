import type { Metadata } from 'next';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { displayName } from '@/lib/profile-display';
import { fetchPublicPageData, resolvePageAvatarMode } from '@/lib/page-data';
import { resolveAccountId, resolveAccountPage } from '@/lib/resolve-account';
import { loadProfileShell } from '@/lib/profile-shell';
import { fetchProfileSignals } from '@/lib/profile-signals';
import { PortfolioActivateStrip } from '@/components/portfolio/portfolio-activate-strip';
import { PortfolioIdentity } from '@/components/portfolio/portfolio-identity';
import { PortfolioLinks } from '@/components/portfolio/portfolio-links';
import { PortfolioShellRoot } from '@/components/portfolio/portfolio-shell-root';
import { PortfolioProfileSeed } from '@/components/portfolio/portfolio-profile-seed';
import { PortfolioSignalsShell } from '@/components/portfolio/portfolio-signals-shell';
import { PortfolioStatsRow } from '@/components/portfolio/portfolio-stats-row';
import { PortfolioTags } from '@/components/portfolio/portfolio-tags';

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
  const avatarMode = resolvePageAvatarMode(
    data.config,
    search?.avatarMode ?? search?.avatar ?? null
  );
  const [shell, signals] = await Promise.all([
    loadProfileShell(accountId),
    fetchProfileSignals(accountId),
  ]);
  const name = displayName(accountId, shell?.name ?? undefined);

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
      avatarMedia={shell?.avatarMedia ?? null}
      bannerMedia={shell?.bannerMedia ?? null}
      committedAvatarMode={committedAvatarMode}
      initialAvatarMode={avatarMode}
      config={data.config}
      stats={data.stats}
      profileName={shell?.name}
    >
      <PortfolioIdentity
        accountId={accountId}
        pageConfig={data.config}
        profileName={shell?.name}
        bio={shell?.bio}
        tagline={tagline}
        avatarUrl={shell?.avatarUrl}
        mood={mood}
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
      <PortfolioTags tags={shell?.tags ?? []} />
    </PortfolioShellRoot>
    </>
  );
}
