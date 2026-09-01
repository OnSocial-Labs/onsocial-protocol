import {
  guildProposalKindFromType,
  guildProposalStatusChipLabel,
} from '@/features/guilds/guild-proposal-display';
import type { ProposalPaintSnapshot } from '@/lib/post-display';

export type ProposalIndexerEvent = {
  operation: string;
  groupId?: string | null;
  proposalId?: string | null;
  title?: string | null;
  proposalType?: string | null;
  status?: string | null;
};

export type PickerDraftFromEvents = {
  pickerKey: string;
  groupId: string;
  proposalId: string;
  title: string;
  kind: string;
  status: string;
  groupName?: string;
  description?: string;
};

const CREATED = 'proposal_created';
const STATUS_UPDATED = 'proposal_status_updated';

export function proposalRefKey(groupId: string, proposalId: string): string {
  return `${groupId}:${proposalId}`;
}

function eventRef(
  event: ProposalIndexerEvent
): { groupId: string; proposalId: string } | null {
  const groupId = event.groupId?.trim() || '';
  const proposalId = event.proposalId?.trim() || '';
  if (!groupId || !proposalId) return null;
  return { groupId, proposalId };
}

function collectByRef(events: readonly ProposalIndexerEvent[]) {
  const created = new Map<string, ProposalIndexerEvent>();
  const latestStatus = new Map<string, string>();

  // Callers pass newest-first (blockHeight DESC). First status_updated wins.
  for (const event of events) {
    const ref = eventRef(event);
    if (!ref) continue;
    const key = proposalRefKey(ref.groupId, ref.proposalId);
    if (event.operation === STATUS_UPDATED) {
      const status = event.status?.trim();
      if (status && !latestStatus.has(key)) latestStatus.set(key, status);
    }
    if (event.operation === CREATED && !created.has(key)) {
      created.set(key, event);
    }
  }

  return { created, latestStatus };
}

/** Live title / kind / status for one proposal from its indexer timeline. */
export function latestProposalPaintFromEvents(
  events: readonly ProposalIndexerEvent[],
  ref: { groupId: string; proposalId: string }
): ProposalPaintSnapshot | null {
  const groupId = ref.groupId.trim();
  const proposalId = ref.proposalId.trim();
  if (!groupId || !proposalId) return null;

  const scoped = events.filter((event) => {
    const ids = eventRef(event);
    return ids?.groupId === groupId && ids.proposalId === proposalId;
  });
  const { created, latestStatus } = collectByRef(scoped);
  const key = proposalRefKey(groupId, proposalId);
  const row = created.get(key);
  const status = latestStatus.get(key) || row?.status?.trim() || '';
  const title = row?.title?.trim() || '';
  const type = row?.proposalType?.trim() || '';
  if (!title && !status && !type) return null;

  return {
    groupId,
    proposalId,
    ...(title ? { title } : {}),
    ...(type ? { kind: guildProposalKindFromType(type) } : {}),
    ...(status ? { status } : {}),
  };
}

/** Open governance proposals (not join requests) for the Public picker. */
export function openPickerDraftsFromEvents(
  events: readonly ProposalIndexerEvent[],
  groupNames: ReadonlyMap<string, string>
): PickerDraftFromEvents[] {
  const { created, latestStatus } = collectByRef(events);
  const drafts: PickerDraftFromEvents[] = [];

  for (const [key, row] of created) {
    const type = row.proposalType?.trim() || '';
    if (type === 'join_request') continue;
    const status = latestStatus.get(key) || row.status?.trim() || '';
    if (status !== 'active') continue;
    const ref = eventRef(row);
    if (!ref) continue;
    const title = row.title?.trim() || 'Proposal';
    const kind = guildProposalKindFromType(type);
    const groupName = groupNames.get(ref.groupId)?.trim() || '';
    drafts.push({
      pickerKey: key,
      groupId: ref.groupId,
      proposalId: ref.proposalId,
      title,
      kind,
      status,
      ...(groupName ? { groupName } : {}),
      description: [kind, groupName || ref.groupId].filter(Boolean).join(' · '),
    });
  }

  return drafts;
}

/** Snapshot first-paints; live indexer title / kind / status win when set. */
export function mergeProposalPaint(
  snapshot: ProposalPaintSnapshot | null,
  live: ProposalPaintSnapshot | null
): ProposalPaintSnapshot | null {
  if (!snapshot && !live) return null;
  const groupId = live?.groupId?.trim() || snapshot?.groupId?.trim();
  const proposalId = live?.proposalId?.trim() || snapshot?.proposalId?.trim();
  const title = live?.title?.trim() || snapshot?.title?.trim();
  const kind = live?.kind?.trim() || snapshot?.kind?.trim();
  const status = live?.status?.trim() || snapshot?.status?.trim();
  const groupName = snapshot?.groupName?.trim() || live?.groupName?.trim();
  return {
    ...(groupId ? { groupId } : {}),
    ...(proposalId ? { proposalId } : {}),
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(status ? { status } : {}),
    ...(groupName ? { groupName } : {}),
  };
}

export function proposalChipKindLine(
  kind: string,
  status?: string | null
): string {
  const statusLabel = guildProposalStatusChipLabel(status);
  return statusLabel ? `${kind} · ${statusLabel}` : kind;
}
