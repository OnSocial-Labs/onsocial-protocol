'use client';

import Link from 'next/link';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import { daoPath } from '@/lib/app-routes';
import { isProtocolGovernanceFace } from '@/lib/portfolio-dao-entity';

/**
 * Kind-line Governance ↔ Treasury switch — same type size as `.portfolio-entity-kind`,
 * one side highlighted. Replaces the separate flipper under org tools.
 */
export function PortfolioDaoKindSwitch({ accountId }: { accountId: string }) {
  const isGovernance = isProtocolGovernanceFace(accountId);

  return (
    <p
      className="portfolio-entity-kind portfolio-entity-kind-switch"
      role="tablist"
      aria-label="Protocol DAO"
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
      <span className="portfolio-entity-kind-sep" aria-hidden>
        ·
      </span>
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
