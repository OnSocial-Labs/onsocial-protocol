'use client';

import type { ReactNode } from 'react';
import { Divider, osDockPillClassName } from '@onsocial/ui';
import { OsDockAccountZone } from '@/components/wallet/os-dock-account-zone';

interface OsDockPillProps {
  pageAccountId?: string;
  grip: ReactNode;
  /** Optional trailing segment, e.g. the compose pen on composable surfaces. */
  action?: ReactNode;
}

/** Unified OS dock — account segment, gradient divider, summon grip. */
export function OsDockPill({ pageAccountId, grip, action }: OsDockPillProps) {
  return (
    <div className={`${osDockPillClassName} portfolio-summon`}>
      <OsDockAccountZone pageAccountId={pageAccountId} />
      <Divider
        orientation="vertical"
        variant="detail"
        className="portfolio-summon-divider"
      />
      {grip}
      {action ? (
        <>
          <Divider
            orientation="vertical"
            variant="detail"
            className="portfolio-summon-divider"
          />
          {action}
        </>
      ) : null}
    </div>
  );
}
