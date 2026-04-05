import { RouteLoadingShell } from '@/components/layout/route-loading-shell';

export default function Loading() {
  return (
    <RouteLoadingShell
      size="wide"
      panelCount={3}
      panelMinHeights={['12rem', '16rem', '16rem']}
    />
  );
}
