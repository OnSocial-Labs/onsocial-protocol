import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { WritingOverlayLeave } from '@/components/portfolio/writing-overlay-leave';
import { PortfolioWritingArticlePanel } from '@/components/portfolio/portfolio-writing-article-panel';
import { loadPortfolioWritingArticlePage } from '@/lib/load-portfolio-writing';
import { panelLabel } from '@/lib/overlay-routes';

type WritingArticleOverlayRouteProps = {
  params: Promise<{
    accountId: string;
    postId: string;
  }>;
};

export default async function WritingArticleOverlayRoute({
  params,
}: WritingArticleOverlayRouteProps) {
  const page = await loadPortfolioWritingArticlePage(params);
  const title = panelLabel('writing');

  return (
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} hideTitle>
        <WritingOverlayLeave accountId={page.accountId} fallback="shelf" />
        <PortfolioWritingArticlePanel
          accountId={page.accountId}
          titleLabel={page.titleLabel}
          avatarUrl={page.avatarUrl}
          post={page.post}
        />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
