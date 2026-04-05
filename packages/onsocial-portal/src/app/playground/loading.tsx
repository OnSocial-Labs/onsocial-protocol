import { RouteLoadingShell } from '@/components/layout/route-loading-shell';

export default function Loading() {
  return (
    <RouteLoadingShell
      size="wide"
      panelCount={2}
      panelMinHeights={['10rem', '24rem']}
    />
  );
}
