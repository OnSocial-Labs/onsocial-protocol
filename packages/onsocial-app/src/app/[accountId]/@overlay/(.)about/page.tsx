import { OverlayInterceptRoot } from '@/components/overlay/overlay-intercept-root';
import { SimpleOverlayPanel } from '@/components/overlay/simple-overlay-panel';
import { PortfolioFaceOverlayLeave } from '@/components/portfolio/portfolio-face-overlay-leave';
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
        <PortfolioFaceOverlayLeave accountId={panel.accountId} />
        <PortfolioAboutPanel {...panel} />
      </SimpleOverlayPanel>
    </OverlayInterceptRoot>
  );
}
