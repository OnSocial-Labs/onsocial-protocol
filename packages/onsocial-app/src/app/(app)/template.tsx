'use client';

import { usePathname } from 'next/navigation';

/**
 * App-switch morph — replays a subtle enter fade on pathname hops between
 * OS apps. Keyed on pathname only: search-param navigations (filters, DM
 * thread open/close) keep the mounted tree and skip the animation.
 */
export default function AppTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="os-page-enter">
      {children}
    </div>
  );
}
