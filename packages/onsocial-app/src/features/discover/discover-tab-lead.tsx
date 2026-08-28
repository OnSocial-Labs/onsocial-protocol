'use client';

import type { ReactNode } from 'react';
import { DiscoverCommunityHandoff } from '@/features/discover/discover-community-handoff';

/** Shared first line (+ optional app handoff) under Discover tab chips. */
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
