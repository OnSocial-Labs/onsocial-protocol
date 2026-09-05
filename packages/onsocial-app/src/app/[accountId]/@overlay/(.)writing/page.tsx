import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { WritingOverlayLeave } from '@/components/portfolio/writing-overlay-leave';
import { PortfolioWritingPanel } from '@/components/portfolio/portfolio-writing-panel';
import { loadPortfolioWritingPage } from '@/lib/load-portfolio-writing';
import { panelLabel } from '@/lib/overlay-routes';

type WritingOverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function WritingOverlayRoute({
  params,
}: WritingOverlayRouteProps) {
  const { panel } = await loadPortfolioWritingPage(params).then((page) => ({
    panel: {
      accountId: page.accountId,
      titleLabel: page.titleLabel,
      avatarUrl: page.avatarUrl,
      articles: page.articles,
    },
  }));
  const title = panelLabel('writing');

  return (
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} hideTitle>
        <WritingOverlayLeave accountId={panel.accountId} />
        <PortfolioWritingPanel {...panel} />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
