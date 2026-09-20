import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { InterceptMisfireRecovery } from '@/components/overlay/intercept-misfire-recovery';
import { WritingOverlayLeave } from '@/components/portfolio/writing-overlay-leave';
import { PortfolioWritingArticleOverlay } from '@/components/portfolio/portfolio-writing-article-overlay';
import { PortfolioWritingOverlay } from '@/components/portfolio/portfolio-writing-panel';
import { loadPortfolioWritingArticlePage } from '@/lib/load-portfolio-writing';
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
      <WritingOverlayLeave accountId={page.accountId} fallback="shelf" />
      <PortfolioWritingArticleOverlay
        mood={page.mood}
        accountId={page.accountId}
        titleLabel={page.titleLabel}
        avatarUrl={page.avatarUrl}
        post={page.post}
        coverHint={
          page.coverHints[`${page.post.accountId}:${page.post.postId}`] ?? null
        }
      />
    </OverlayInterceptRoot>
  );
}
