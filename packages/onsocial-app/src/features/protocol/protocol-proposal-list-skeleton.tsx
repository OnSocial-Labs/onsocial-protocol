'use client';

import { OsProposalCardList } from '@onsocial/ui';

/** Shimmer placeholders for the protocol / DAO proposals feed. */
export function ProtocolProposalListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <OsProposalCardList
      className="protocol-card-list protocol-card-list--skeleton"
      aria-hidden
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="protocol-proposal-skeleton-row">
          <div className="protocol-proposal-skeleton-strip">
            <span className="standing-row-shimmer protocol-proposal-skeleton-pill protocol-proposal-skeleton-pill-wide" />
            <span className="standing-row-shimmer protocol-proposal-skeleton-pill" />
          </div>
          <span className="standing-row-shimmer standing-row-shimmer-line protocol-proposal-skeleton-title" />
          <span className="standing-row-shimmer standing-row-shimmer-line-sm protocol-proposal-skeleton-meta" />
        </div>
      ))}
    </OsProposalCardList>
  );
}
