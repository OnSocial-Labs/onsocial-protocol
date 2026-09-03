'use client';

import type { ReactNode } from 'react';
import { DiscoverCommunityHandoff } from '@/features/discover/discover-community-handoff';

/** One hint line under the tab chips. App handoffs sit on this row. */
export function DiscoverTabLead({
  children,
  links,
}: {
  children: ReactNode;
  links?: ReadonlyArray<{ href: string; label: string }>;
}) {
  return (
    <div className="discover-community-toolbar">
      <p className="launcher-home-empty dao-discover-status">{children}</p>
      {links && links.length > 0 ? (
        <DiscoverCommunityHandoff links={links} />
      ) : null}
    </div>
  );
}
