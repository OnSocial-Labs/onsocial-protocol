import { RouteLoadingShell } from '@/components/layout/route-loading-shell';

export default function Loading() {
  return (
    <RouteLoadingShell
      size="wide"
      panelCount={3}
      panelMinHeights={['16rem', '14rem', '18rem']}
    />
  );
}
