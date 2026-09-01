'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BoxCheckIcon } from '@onsocial/ui';
import { guildProposalPath } from '@/features/guilds/guilds-data';
import {
  mergeProposalPaint,
  proposalChipKindLine,
  proposalRefKey,
} from '@/features/guilds/proposal-indexer-events';
import {
  getCachedProposalPaint,
  hydrateProposalPaints,
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

export function useLiveProposalPaint(
  embed: PostProposalEmbed | null,
  snapshot: ProposalPaintSnapshot | null
): ProposalPaintSnapshot | null {
  const groupId = embed?.groupId?.trim() || snapshot?.groupId?.trim() || '';
  const proposalId =
    embed?.proposalId?.trim() || snapshot?.proposalId?.trim() || '';
  const [live, setLive] = useState<ProposalPaintSnapshot | null>(() => {
    if (!groupId || !proposalId) return null;
    return getCachedProposalPaint(groupId, proposalId) ?? null;
  });

  useEffect(() => {
    if (!groupId || !proposalId) {
      setLive(null);
      return;
    }
    const cached = getCachedProposalPaint(groupId, proposalId);
    if (cached !== undefined) {
      setLive(cached);
      return;
    }
    let cancelled = false;
    void hydrateProposalPaints([{ groupId, proposalId }])
      .then((map) => {
        if (cancelled) return;
        setLive(map.get(proposalRefKey(groupId, proposalId)) ?? null);
      })
      .catch(() => {
        if (!cancelled) setLive(null);
      });
    return () => {
      cancelled = true;
    };
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
