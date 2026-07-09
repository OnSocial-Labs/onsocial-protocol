'use client';

import Link from 'next/link';
import { ProfileAvatar } from '@onsocial/ui';
import type { EndorsementPanelItem } from '@/lib/endorsements-panel-data';
import {
  endorsementPartyLabel,
  formatEndorsementTime,
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';
import { portfolioPath } from '@/lib/overlay-routes';

interface EndorsementListRowProps {
  item: EndorsementPanelItem;
  /** Whose page this list is on — drives which party is the “other”. */
  pageAccountId: string;
  mode: 'received' | 'given';
}

export function EndorsementListRow({
  item,
  pageAccountId,
  mode,
}: EndorsementListRowProps) {
  const otherAccountId = mode === 'received' ? item.issuer : item.target;
  const otherName =
    mode === 'received' ? item.issuerName : item.targetName;
  const otherAvatar =
    mode === 'received' ? item.issuerAvatarUrl : item.targetAvatarUrl;
  const label = endorsementPartyLabel(otherAccountId, otherName);
  const topic = humanizeEndorsementTopic(item.topic);
  const time = formatEndorsementTime(item);
  const note = item.note?.trim() || null;

  return (
    <article className="endorsement-row">
      <Link
        href={portfolioPath(otherAccountId)}
        className="endorsement-row-main"
        scroll={false}
      >
        <ProfileAvatar
          src={otherAvatar}
          size="lg"
          className="standing-row-avatar-slot"
        />
        <span className="endorsement-row-copy">
          <span className="endorsement-row-title">
            <span className="endorsement-row-name">{label}</span>
            {topic ? (
              <span className="endorsement-row-topic">{topic}</span>
            ) : null}
          </span>
          {note ? <span className="endorsement-row-note">{note}</span> : null}
          <span className="endorsement-row-meta">
            {mode === 'received' ? 'Endorsed' : 'Gave'}
            {time ? ` · ${time}` : ''}
            <span className="sr-only">
              {' '}
              · {mode === 'received' ? 'received by' : 'from'} @{pageAccountId}
            </span>
          </span>
        </span>
      </Link>
    </article>
  );
}

export function EndorsementListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="endorsement-list" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="endorsement-row endorsement-row--skeleton">
          <span className="standing-row-shimmer standing-row-shimmer-avatar" />
          <span className="endorsement-row-copy">
            <span className="standing-row-shimmer standing-row-shimmer-line endorsement-row-shimmer-name" />
            <span className="standing-row-shimmer standing-row-shimmer-line endorsement-row-shimmer-note" />
          </span>
        </div>
      ))}
    </div>
  );
}
