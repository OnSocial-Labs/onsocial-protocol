'use client';

import Link from 'next/link';
import { BoxCheckIcon } from '@onsocial/ui';
import { guildProposalPath } from '@/features/guilds/guilds-data';
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

  return (
    <Link
      href={href}
      className="post-card-proposal"
      scroll={false}
      onClick={(event) => event.stopPropagation()}
    >
      <BoxCheckIcon className="post-card-proposal-icon" aria-hidden />
      <span className="post-card-proposal-copy">
        <span className="post-card-proposal-kind">{kind}</span>
        <span className="post-card-proposal-title">{title}</span>
        {groupName ? (
          <span className="post-card-proposal-guild">{groupName}</span>
        ) : null}
      </span>
    </Link>
  );
}
