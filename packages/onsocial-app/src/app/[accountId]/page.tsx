import type { Metadata } from 'next';
import { resolvePortfolioMood } from '@/lib/moods/resolve';
import { displayName } from '@/lib/profile-display';
import { fetchPublicPageData } from '@/lib/page-data';
import { resolveAccountId, resolveAccountPage } from '@/lib/resolve-account';
import { PortfolioIdentity } from '@/components/portfolio/portfolio-identity';
import { PortfolioLinks } from '@/components/portfolio/portfolio-links';
import { PortfolioOverview } from '@/components/portfolio/portfolio-overview';
import { PortfolioShell } from '@/components/portfolio/portfolio-shell';
import { PortfolioStats } from '@/components/portfolio/portfolio-stats';
import { PortfolioTags } from '@/components/portfolio/portfolio-tags';

type AccountPageProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export async function generateMetadata({
  params,
}: AccountPageProps): Promise<Metadata> {
  const accountId = await resolveAccountId(params);
  const data = await fetchPublicPageData(accountId);
  const titleLabel = displayName(accountId, data?.profile.name);
  const description =
    data?.config.tagline?.trim() ||
    data?.profile.bio?.trim() ||
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

export default async function AccountPage({ params }: AccountPageProps) {
  const { accountId, data } = await resolveAccountPage(params);
  const tagline = data.config.tagline?.trim();
  const mood = resolvePortfolioMood(data.config);

  return (
    <PortfolioShell
      mood={mood}
      pageAccountId={accountId}
      activated={Boolean(data.activated)}
    >
      <PortfolioIdentity
        accountId={accountId}
        profileName={data.profile.name}
        bio={data.profile.bio}
        tagline={tagline}
        avatar={data.profile.avatar}
        activated={data.activated}
        mood={mood}
      />

      <PortfolioStats stats={data.stats} />
      <PortfolioOverview accountId={accountId} data={data} />
      <PortfolioLinks links={data.profile.links} />
      <PortfolioTags tags={data.profile.tags} />
    </PortfolioShell>
  );
}
