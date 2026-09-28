'use client';

import Link from 'next/link';
import { GOVERNANCE_DAO_ACCOUNT, TREASURY_DAO_ACCOUNT } from '@/lib/app-config';
import { daoPath } from '@/lib/app-routes';
import { isProtocolGovernanceFace } from '@/lib/portfolio-dao-entity';
import { useProtocolFacePairInset } from '@/components/portfolio/protocol-face-pair';

/**
 * Kind-line Governance ↔ Treasury switch — compact eyebrow (0.72rem), chip tokens,
 * sentence case. Replaces the separate flipper under org tools.
 */
export function PortfolioDaoKindSwitch({ accountId }: { accountId: string }) {
  const isGovernance = isProtocolGovernanceFace(accountId);
  const spacer = useProtocolFacePairInset();

  return (
    <p
      className="portfolio-entity-kind portfolio-entity-kind-switch"
      role={spacer ? undefined : 'tablist'}
      aria-label={spacer ? undefined : 'Protocol DAO'}
      aria-hidden={spacer || undefined}
      inert={spacer || undefined}
    >
      <Link
        href={daoPath(GOVERNANCE_DAO_ACCOUNT)}
        role="tab"
        aria-selected={isGovernance}
        className={`portfolio-entity-kind-option${isGovernance ? ' is-active' : ''}`}
        scroll={false}
      >
        Governance
      </Link>
      <Link
        href={daoPath(TREASURY_DAO_ACCOUNT)}
        role="tab"
        aria-selected={!isGovernance}
        className={`portfolio-entity-kind-option${!isGovernance ? ' is-active' : ''}`}
        scroll={false}
      >
        Treasury
      </Link>
    </p>
  );
}
