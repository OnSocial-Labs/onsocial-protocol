'use client';

import Link from 'next/link';
import { standingIdentityLabel } from '@onsocial/ui';
import { StandingIdentity } from '@/components/profile/standing-identity';
import { PostMediaStrip } from '@/features/home/post-media';
import { ProtocolNameTrailing } from '@/features/protocol/protocol-name-trailing';
import type { EndorsementPanelItem } from '@/lib/endorsements-panel-data';
import {
  formatEndorsementTime,
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';
import { endorsementStageMedia } from '@/lib/endorsement-media';
import { portfolioPath } from '@/lib/overlay-routes';

interface EndorsementListRowProps {
  item: EndorsementPanelItem;
  /** Whose page this list is on — drives which party is the “other”. */
  pageAccountId: string;
  mode: 'received' | 'given';
  /** Open the shareable focus sheet (row tap). Actions live on that sheet. */
  onOpen?: () => void;
}

/**
 * Endorsement list row — StandingIdentity chrome plus the vouch (topic, note,
 * proof). Tap opens the sheet. Support, Share, and Edit live there once.
 */
export function EndorsementListRow({
  item,
  pageAccountId,
  mode,
  onOpen,
}: EndorsementListRowProps) {
  const otherAccountId = mode === 'received' ? item.issuer : item.target;
  const otherName = mode === 'received' ? item.issuerName : item.targetName;
  const otherAvatar =
    mode === 'received' ? item.issuerAvatarUrl : item.targetAvatarUrl;
  const { label } = standingIdentityLabel(otherAccountId, otherName);
  const topic = humanizeEndorsementTopic(item.topic);
  const time = formatEndorsementTime(item);
  const note = item.note?.trim() || null;
  const stageMedia = endorsementStageMedia({
    media: item.media,
    mediaUrl: item.mediaUrl,
  });
  const supporterCount = item.supporterCount ?? 0;

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
          {stageMedia ? (
            <span className="endorsement-row-media">
              <PostMediaStrip items={[stageMedia]} size="compact" />
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
