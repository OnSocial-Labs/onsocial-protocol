import type { Metadata } from 'next';
import { PortfolioAboutScreen } from '@/components/portfolio/portfolio-about-screen';
import { loadPortfolioAboutPage } from '@/lib/load-portfolio-about';

export const dynamic = 'force-dynamic';

type AboutPageProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export async function generateMetadata({
  params,
}: AboutPageProps): Promise<Metadata> {
  const { titleLabel, aboutBio, accountId } = await loadPortfolioAboutPage(
    params
  );
  const description = aboutBio ?? `About ${titleLabel}.`;

  return {
    title: `${titleLabel} · About`,
    description,
    openGraph: {
      title: `${titleLabel} · About`,
      description,
      siteName: 'OnSocial',
      type: 'profile',
    },
    alternates: {
      canonical: `/@${encodeURIComponent(accountId)}/about`,
    },
  };
}

export default async function PortfolioAboutPage({ params }: AboutPageProps) {
  const { panel } = await loadPortfolioAboutPage(params);
  return <PortfolioAboutScreen {...panel} />;
}
