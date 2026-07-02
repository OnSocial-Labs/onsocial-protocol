'use client';

import type { ReactNode } from 'react';
import { Divider } from '@onsocial/ui';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';

interface OsDockPillProps {
  pageAccountId?: string;
  grip: ReactNode;
}

/** Unified OS dock — account segment, gradient divider, summon grip. */
export function OsDockPill({ pageAccountId, grip }: OsDockPillProps) {
  return (
    <div className="portfolio-summon">
      <OsDockAccountZone pageAccountId={pageAccountId} />
      <Divider
        orientation="vertical"
        variant="detail"
        className="portfolio-summon-divider"
      />
      {grip}
    </div>
  );
}
