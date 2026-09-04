import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { AboutOverlayLeave } from '@/components/portfolio/about-overlay-leave';
import { PortfolioAboutPanel } from '@/components/portfolio/portfolio-about-panel';
import { loadPortfolioAboutPage } from '@/lib/load-portfolio-about';
import { panelLabel } from '@/lib/overlay-routes';

type AboutOverlayRouteProps = {
  params: Promise<{
    accountId: string;
  }>;
};

export default async function AboutOverlayRoute({
  params,
}: AboutOverlayRouteProps) {
  const { panel } = await loadPortfolioAboutPage(params);
  const title = panelLabel('about');

  return (
    <OverlayInterceptRoot>
      <SimpleOverlayPanel ariaTitle={title} hideTitle>
        <AboutOverlayLeave accountId={panel.accountId} />
        <PortfolioAboutPanel {...panel} />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
