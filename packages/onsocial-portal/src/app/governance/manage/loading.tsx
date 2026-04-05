import { RouteLoadingShell } from '@/components/layout/route-loading-shell';

export default function Loading() {
  return (
    <RouteLoadingShell
      className="max-w-5xl"
      panelCount={2}
      panelMinHeights={['10rem', '20rem']}
    />
  );
}
