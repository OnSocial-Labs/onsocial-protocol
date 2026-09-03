'use client';

import Link from 'next/link';
import {
  standingIdentityLabel,
} from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import type { EndorsementPanelItem } from '@/lib/endorsements-panel-data';
import {
  formatEndorsementTime,
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';
import {
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
} from '@/lib/endorsement-media';
import { portfolioPath } from '@/lib/overlay-routes';
import { resolveEndorsementSpendTargetId } from '@/lib/social-spend-endorsement';

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
  /** Open the shareable focus sheet (row tap). */
  onOpen?: () => void;
}

/**
 * Endorsement list row — StandingIdentity chrome + vouch body (topic / note /
 * media) + quiet Support · Edit rail. Same row shell as Standing lists.
 */
export function EndorsementListRow({
  item,
  pageAccountId,
  mode,
  viewerAccountId = null,
  canEdit = false,
  onEdit,
  canSupport = false,
  onSupport,
  onOpen,
}: EndorsementListRowProps) {
  const otherAccountId = mode === 'received' ? item.issuer : item.target;
  const otherName =
    mode === 'received' ? item.issuerName : item.targetName;
  const otherAvatar =
    mode === 'received' ? item.issuerAvatarUrl : item.targetAvatarUrl;
  const { label } = standingIdentityLabel(otherAccountId, otherName);
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
  const supporterCount = item.supporterCount ?? 0;

  const showSupport =
    canSupport &&
    Boolean(onSupport) &&
    Boolean(spendTargetId) &&
    (!viewerAccountId || viewerAccountId !== item.target);
  const hasAside = showSupport || (canEdit && Boolean(onEdit));

  return (
    <article className="standing-row endorsement-standing-row">
      <div className="standing-row-main">
        {onOpen ? (
          <button
            type="button"
            className="standing-row-hit"
            aria-label={
              mode === 'received'
                ? `Open endorsement from ${label}`
                : `Open endorsement for ${label}`
            }
            onClick={onOpen}
          />
        ) : (
          <Link
            href={portfolioPath(otherAccountId)}
            className="standing-row-hit"
            scroll={false}
            aria-label={`View ${label}'s profile`}
          />
        )}
        <StandingIdentity
          accountId={otherAccountId}
          profileName={otherName}
          avatarUrl={otherAvatar}
          nameTrailing={
            <ProtocolNameTrailing
              accountId={otherAccountId}
              extra={
                topic ? (
                  <span className="endorsement-row-topic">{topic}</span>
                ) : null
              }
            />
          }
        >
          {note ? <span className="endorsement-row-note">{note}</span> : null}
          {mediaUrl ? (
            <span className="endorsement-row-media">
              {mediaMime?.toLowerCase().startsWith('video/') ? (
                <video
                  src={mediaUrl}
                  className="endorsement-row-media-el"
                  autoPlay
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  aria-label={
                    topic
                      ? `Endorsement video for ${topic}`
                      : 'Endorsement video'
                  }
                />
              ) : (
                <img
                  src={mediaUrl}
                  alt={media?.alt?.trim() || ''}
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
              ? ` · ${supporterCount} supporter${supporterCount === 1 ? '' : 's'}`
              : ''}
            <span className="sr-only">
              {' '}
              · {mode === 'received' ? 'received by' : 'from'} @{pageAccountId}
            </span>
          </span>
        </StandingIdentity>
      </div>

      <div
        className={`standing-row-aside${hasAside ? '' : ' is-empty'}`}
      >
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
    <div className="standing-list endorsement-list" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="standing-row standing-row--skeleton endorsement-standing-row"
        >
          <div className="standing-row-main">
            <span className="standing-row-shimmer standing-row-avatar" />
            <span className="standing-row-copy">
              <span className="standing-row-shimmer standing-row-shimmer-line endorsement-row-shimmer-name" />
              <span className="standing-row-shimmer standing-row-shimmer-line endorsement-row-shimmer-note" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
