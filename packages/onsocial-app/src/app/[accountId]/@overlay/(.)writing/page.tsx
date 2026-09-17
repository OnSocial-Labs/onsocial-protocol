import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { PortfolioWritingOverlay } from '@/components/portfolio/portfolio-writing-panel';
import { loadPortfolioWritingPage } from '@/lib/load-portfolio-writing';
import { isInterceptMisfireSegment } from '@/lib/resolve-account';

type WritingOverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function WritingOverlayRoute({
  params,
}: WritingOverlayRouteProps) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const page = await loadPortfolioWritingPage(params);

  return (
    <OverlayInterceptRoot>
      <PortfolioWritingOverlay
        mood={page.mood}
        accountId={page.accountId}
        titleLabel={page.titleLabel}
        avatarUrl={page.avatarUrl}
        articles={page.articles}
        coverHints={page.coverHints}
      />
    </OverlayInterceptRoot>
  );
}
