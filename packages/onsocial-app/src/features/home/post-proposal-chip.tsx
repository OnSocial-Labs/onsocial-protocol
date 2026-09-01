'use client';

import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BoxCheckIcon } from '@onsocial/ui';
import { guildProposalPath } from '@/features/guilds/guilds-data';
import {
  mergeProposalPaint,
  proposalChipKindLine,
} from '@/features/guilds/proposal-indexer-events';
import {
  getCachedProposalPaint,
  hydrateProposalPaints,
  subscribeProposalPaintCache,
} from '@/lib/proposal-paint-hydrate';
import type {
  PostProposalEmbed,
  ProposalPaintSnapshot,
} from '@/lib/post-display';

export function postProposalHref(
  embed: PostProposalEmbed | null,
  paint: ProposalPaintSnapshot | null
): string | null {
  const groupId = embed?.groupId?.trim() || paint?.groupId?.trim() || '';
  const proposalId =
    embed?.proposalId?.trim() || paint?.proposalId?.trim() || '';
  if (!groupId || !proposalId) return null;
  return guildProposalPath(groupId, proposalId);
}

function readCachedPaint(
  groupId: string,
  proposalId: string
): ProposalPaintSnapshot | null {
  if (!groupId || !proposalId) return null;
  return getCachedProposalPaint(groupId, proposalId) ?? null;
}

export function useLiveProposalPaint(
  embed: PostProposalEmbed | null,
  snapshot: ProposalPaintSnapshot | null
): ProposalPaintSnapshot | null {
  const groupId = embed?.groupId?.trim() || snapshot?.groupId?.trim() || '';
  const proposalId =
    embed?.proposalId?.trim() || snapshot?.proposalId?.trim() || '';

  const live = useSyncExternalStore(
    subscribeProposalPaintCache,
    () => readCachedPaint(groupId, proposalId),
    () => null
  );

  useEffect(() => {
    if (!groupId || !proposalId) return;
    if (getCachedProposalPaint(groupId, proposalId) !== undefined) return;
    void hydrateProposalPaints([{ groupId, proposalId }]).catch(() => {
      // Snapshot chip stays up if the indexer miss-fires.
    });
  }, [groupId, proposalId]);

  return mergeProposalPaint(snapshot, live);
}

export function PostProposalChip({
  embed,
  paint,
}: {
  embed: PostProposalEmbed | null;
  paint: ProposalPaintSnapshot | null;
}) {
  const href = postProposalHref(embed, paint);
  if (!href) return null;
  const title = paint?.title?.trim() || 'Proposal';
  const kind = paint?.kind?.trim() || 'Proposal';
  const groupName = paint?.groupName?.trim() || null;
  const kindLine = proposalChipKindLine(kind, paint?.status);

  return (
    <Link
      href={href}
      className="post-card-proposal"
      scroll={false}
      onClick={(event) => event.stopPropagation()}
    >
      <BoxCheckIcon className="post-card-proposal-icon" aria-hidden />
      <span className="post-card-proposal-copy">
        <span className="post-card-proposal-kind">{kindLine}</span>
        <span className="post-card-proposal-title">{title}</span>
        {groupName ? (
          <span className="post-card-proposal-guild">{groupName}</span>
        ) : null}
      </span>
    </Link>
  );
}
