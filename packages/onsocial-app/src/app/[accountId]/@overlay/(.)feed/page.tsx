import { PortfolioFeedScrollRedirect } from '@/components/portfolio/portfolio-feed-scroll-redirect';
import { resolveAccountId } from '@/lib/resolve-account';

type OverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function FeedOverlay({ params }: OverlayRouteProps) {
  const accountId = await resolveAccountId(params);
  return <PortfolioFeedScrollRedirect accountId={accountId} />;
}
