import { RouteLoadingShell } from '@/components/layout/route-loading-shell';

export default function Loading() {
  return (
    <RouteLoadingShell
      panelCount={3}
      panelMinHeights={['10rem', '18rem', '16rem']}
    />
  );
}
