'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProfileAvatar } from '@onsocial/ui';
import type { EndorsementPanelItem } from '@/lib/endorsements-panel-data';
import {
  endorsementPartyLabel,
  formatEndorsementTime,
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';
import {
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
} from '@/lib/endorsement-media';
import { portfolioPath } from '@/lib/overlay-routes';
import {
  fetchEndorsementSupportStats,
  isEndorsementSpendTargetId,
  resolveEndorsementSpendTargetId,
} from '@/lib/social-spend-endorsement';

interface EndorsementListRowProps {
  item: EndorsementPanelItem;
  /** Whose page this list is on — drives which party is the “other”. */
  pageAccountId: string;
  mode: 'received' | 'given';
  viewerAccountId?: string | null;
  /** When set, show Edit for the viewer’s own vouch on this target. */
  canEdit?: boolean;
  onEdit?: () => void;
  /** When set, show Support for SOCIAL spend on this vouch. */
  canSupport?: boolean;
  onSupport?: () => void;
}

export function EndorsementListRow({
  item,
  pageAccountId,
  mode,
  viewerAccountId = null,
  canEdit = false,
  onEdit,
  canSupport = false,
  onSupport,
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
  const media = parseEndorsementMediaRef(item.media);
  const mediaUrl = resolveEndorsementDisplayMediaUrl({
    media,
    mediaUrl: item.mediaUrl,
  });
  const mediaMime = media?.mime ?? null;
  const spendTargetId = resolveEndorsementSpendTargetId({
    id: typeof item.id === 'string' ? item.id : null,
    issuer: item.issuer,
    target: item.target,
    topic: item.topic,
  });
  const [supporterCount, setSupporterCount] = useState(0);

  useEffect(() => {
    if (!spendTargetId || !isEndorsementSpendTargetId(spendTargetId)) {
      return;
    }
    let cancelled = false;
    void fetchEndorsementSupportStats(spendTargetId)
      .then((stats) => {
        if (!cancelled) setSupporterCount(stats.supporterCount);
      })
      .catch(() => {
        if (!cancelled) setSupporterCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [spendTargetId]);

  const showSupport =
    canSupport &&
    Boolean(onSupport) &&
    Boolean(spendTargetId) &&
    (!viewerAccountId || viewerAccountId !== item.target);

  return (
    <article className="endorsement-row">
      <div className="endorsement-row-body">
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
            {mediaUrl ? (
              <span className="endorsement-row-media">
                {mediaMime?.toLowerCase().startsWith('video/') ? (
                  <video
                    src={mediaUrl}
                    className="endorsement-row-media-el"
                    muted
                    playsInline
                    loop
                    preload="metadata"
                  />
                ) : (
                  <img
                    src={mediaUrl}
                    alt=""
                    className="endorsement-row-media-el"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </span>
            ) : null}
            <span className="endorsement-row-meta">
              {mode === 'received' ? 'Endorsed' : 'Gave'}
              {time ? ` · ${time}` : ''}
              {supporterCount > 0
                ? ` · ${supporterCount} support${supporterCount === 1 ? '' : 's'}`
                : ''}
              <span className="sr-only">
                {' '}
                · {mode === 'received' ? 'received by' : 'from'} @{pageAccountId}
              </span>
            </span>
          </span>
        </Link>
      </div>
      <div className="endorsement-row-actions">
        {showSupport ? (
          <button
            type="button"
            className="endorsement-row-action"
            onClick={onSupport}
          >
            Support
          </button>
        ) : null}
        {canEdit && onEdit ? (
          <button
            type="button"
            className="endorsement-row-action"
            onClick={onEdit}
          >
            Edit
          </button>
        ) : null}
      </div>
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
