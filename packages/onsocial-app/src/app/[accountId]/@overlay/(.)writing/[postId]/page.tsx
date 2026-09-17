import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { WritingOverlayLeave } from '@/components/portfolio/writing-overlay-leave';
import { PortfolioWritingArticlePanel } from '@/components/portfolio/portfolio-writing-article-panel';
import { PortfolioWritingOverlay } from '@/components/portfolio/portfolio-writing-panel';
import { loadPortfolioWritingArticlePage } from '@/lib/load-portfolio-writing';
import { panelLabel } from '@/lib/overlay-routes';
import { isInterceptMisfireSegment } from '@/lib/resolve-account';

type WritingArticleOverlayRouteProps = {
  params: Promise<{
    accountId: string;
    postId: string;
  }>;
};

export default async function WritingArticleOverlayRoute({
  params,
}: WritingArticleOverlayRouteProps) {
  const { accountId: routeSegment } = await params;
  if (isInterceptMisfireSegment(routeSegment)) {
    return <InterceptMisfireRecovery />;
  }
  const page = await loadPortfolioWritingArticlePage(params);
  const title = panelLabel('writing');

  if (!page.post) {
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

  return (
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} hideTitle>
        <WritingOverlayLeave accountId={page.accountId} fallback="shelf" />
        <PortfolioWritingArticlePanel
          accountId={page.accountId}
          titleLabel={page.titleLabel}
          avatarUrl={page.avatarUrl}
          post={page.post}
          coverHint={
            page.coverHints[`${page.post.accountId}:${page.post.postId}`] ??
            null
          }
        />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
