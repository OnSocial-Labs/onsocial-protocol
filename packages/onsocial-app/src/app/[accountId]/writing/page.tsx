import type { Metadata } from 'next';
import { PortfolioWritingScreen } from '@/components/portfolio/portfolio-writing-screen';
import { loadPortfolioWritingPage } from '@/lib/load-portfolio-writing';

type WritingPageProps = {
  params: Promise<{ accountId: string }>;
};

export async function generateMetadata({
  params,
}: WritingPageProps): Promise<Metadata> {
  const { titleLabel, accountId } = await loadPortfolioWritingPage(params);
  return {
    title: `Writing · ${titleLabel}`,
    description: `Articles by ${titleLabel}.`,
    alternates: {
      canonical: `/@${encodeURIComponent(accountId)}/writing`,
    },
  };
}

export default async function PortfolioWritingPage({
  params,
}: WritingPageProps) {
  const { mood, articles, accountId, titleLabel, avatarUrl } =
    await loadPortfolioWritingPage(params);
  return (
    <PortfolioWritingScreen
      mood={mood}
      accountId={accountId}
      titleLabel={titleLabel}
      avatarUrl={avatarUrl}
      articles={articles}
    />
  );
}
