
import type { Proposal } from '@onsocial/sdk';
import {
  parseGuildStructure,
  type GuildStructureDocument,
} from '@/features/guilds/guild-structure';
import { guildMediaUrlFromCid } from '@/features/guilds/guild-visual';
import {
  normalizeTopicList,
  TOPIC_MAX_PER_ENTITY,
} from '@/lib/topic-slug';
import { COMMUNITY_TOPIC_SUGGESTIONS } from '@/lib/community-topic-suggestions';
export const GUILD_COLLABORATIVE_JOIN_STORAGE_MIN_NEAR = '0.1';

export const GUILD_COLLABORATIVE_JOIN_STORAGE_MIN_YOCTO = 100_000_000_000_000_000_000_000n;

export const GUILD_COLLABORATIVE_JOIN_STORAGE_HINT =
  'Collaborative guilds need ~0.1 NEAR storage to request membership.';

export function collaborativeJoinNeedsStorage(input: {
  memberDriven: boolean;
  isMember: boolean;
  joinPending: boolean;
  availableYocto: bigint | null | undefined;
}): boolean {
  if (!input.memberDriven || input.isMember || input.joinPending) {
    return false;
  }
  if (input.availableYocto === null || input.availableYocto === undefined) {
    return false;
  }
  return input.availableYocto < GUILD_COLLABORATIVE_JOIN_STORAGE_MIN_YOCTO;
}

export interface GuildMemberRequestRow {
  id: string;
  requesterId: string;
  message: string | null;
  requestedAt: string | number | null;
  proposalId: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

export function joinRequestMessageFromProposalData(
  data: Record<string, unknown> | undefined
): string | null {
  const joinRequest = readRecord(data?.JoinRequest);
  return readString(joinRequest?.message);
}

export function joinRequesterFromProposal(input: {
  proposer: string;
  target?: string;
  data?: Record<string, unknown>;
}): string {
  const joinRequest = readRecord(input.data?.JoinRequest);
  const requester = readString(joinRequest?.requester);
  if (requester) return requester;
  if (input.target?.trim()) return input.target;
  return input.proposer;
}

export function listActiveJoinRequestProposals<
  T extends {
    id: string;
    status: string;
    type: string;
    proposer: string;
    target?: string;
    data?: Record<string, unknown>;
    created_at?: string;
  },
>(proposals: T[]): GuildMemberRequestRow[] {
  const rows: GuildMemberRequestRow[] = [];
  for (const proposal of proposals) {
    if (proposal.status !== 'active' || proposal.type !== 'join_request') {
      continue;
    }
    rows.push({
      id: proposal.id,
      requesterId: joinRequesterFromProposal(proposal),
      message: joinRequestMessageFromProposalData(proposal.data),
      requestedAt: proposal.created_at ?? null,
      proposalId: proposal.id,
    });
  }
  return rows;
}

export function listSubmittedJoinRequestsFromEvents(
  rows: Array<{ memberId: string | null; author: string }>
): GuildMemberRequestRow[] {
  const seen = new Set<string>();
  const requests: GuildMemberRequestRow[] = [];
  for (const row of rows) {
    const requesterId = row.memberId?.trim() || row.author.trim();
    if (!requesterId) continue;
    const key = requesterId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    requests.push({
      id: requesterId,
      requesterId,
      message: null,
      requestedAt: null,
      proposalId: null,
    });
  }
  return requests;
}

export function isOwnGuildMemberRequest(
  row: GuildMemberRequestRow,
  accountId: string | null | undefined
): boolean {
  if (!accountId?.trim()) return false;
  return row.requesterId.toLowerCase() === accountId.trim().toLowerCase();
}

export function isOwnJoinRequestProposal(
  proposal: { proposer: string; target?: string },
  accountId: string | null | undefined
): boolean {
  if (!accountId?.trim()) return false;
  const needle = accountId.trim().toLowerCase();
  const requester = joinRequesterFromProposal(proposal);
  return requester.toLowerCase() === needle;
}

/** Minimal proposal shape for access-gated join requests that are not on-chain proposals. */
export function memberRequestRowToProposal(row: GuildMemberRequestRow): Proposal {
  const message =
    row.message?.trim() || 'Requested access to this guild.';
  return {
    id: row.id,
    sequence_number: 0,
    title: '',
    type: 'join_request',
    status: 'active',
    description: message,
    proposer: row.requesterId,
    target: row.requesterId,
    data: {
      JoinRequest: {
        requester: row.requesterId,
        message,
      },
    },
    created_at:
      row.requestedAt !== null && row.requestedAt !== undefined
        ? String(row.requestedAt)
        : '',
    voting_config: {
      participation_quorum_bps: 0,
      majority_threshold_bps: 0,
      voting_period: '1d',
    },
  };
}

/** Join-request votes require guild membership; requesters cannot vote on their own proposal. */
export function canVoteOnGuildMemberRequest(input: {
  row: GuildMemberRequestRow;
  accountId: string | null | undefined;
  isMember: boolean;
}): boolean {
  if (!input.isMember) return false;
  return !isOwnGuildMemberRequest(input.row, input.accountId);
}

export function findActiveJoinProposalForAccount<
  T extends { status: string; type: string; proposer: string; target?: string; id: string },
>(proposals: T[], accountId: string): T | null {
  const needle = accountId.toLowerCase();
  for (const proposal of proposals) {
    if (proposal.status !== 'active' || proposal.type !== 'join_request') {
      continue;
    }
    if (proposal.proposer.toLowerCase() !== needle) continue;
    if (proposal.target?.toLowerCase() !== needle) continue;
    return proposal;
  }
  return null;
}


export interface GuildConfigSnapshot {
  name: string;
  description: string;
  bannerUrl: string | null;
  /** Small identity mark beside the name — not a crest/face. */
  badgeUrl: string | null;
  ownerId: string | null;
  accessGated: boolean;
  memberDriven: boolean;
  /** Topics — primary first; max 2. */
  topics: string[];
  structure: GuildStructureDocument;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

/** Same access derivation for cards, hero, and settings — config wins over indexer. */
export function deriveGuildAccessGated(
  input: Record<string, unknown> | {
    isPublic?: boolean | null;
    isPrivate?: boolean | null;
    is_private?: boolean | null;
  }
): boolean {
  if (readBoolean(input.is_private) || readBoolean(input.isPrivate)) {
    return true;
  }
  if (input.isPublic === false) return true;
  if (input.isPublic === true) return false;
  return false;
}

function readNestedString(value: unknown, path: string[]): string | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (typeof cursor !== 'object' || cursor === null) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return readString(cursor);
}

export function normalizeGuildConfig(
  groupId: string,
  raw: Record<string, unknown>
): GuildConfigSnapshot {
  const rawTopics = Array.isArray(raw.topics)
    ? raw.topics.filter((topic): topic is string => typeof topic === 'string')
    : [];
  const bannerCid = readNestedString(raw, ['x', 'onsocial', 'banner', 'cid']);
  const badgeCid = readNestedString(raw, ['x', 'onsocial', 'badge', 'cid']);

  const owner = readString(raw.owner)?.trim() ?? '';

  return {
    name: readString(raw.name) ?? groupId,
    description: readString(raw.description) ?? '',
    bannerUrl: guildMediaUrlFromCid(bannerCid),
    badgeUrl: guildMediaUrlFromCid(badgeCid),
    ownerId: owner || null,
    accessGated: deriveGuildAccessGated(raw),
    memberDriven:
      readBoolean(raw.member_driven) || readBoolean(raw.memberDriven),
    topics: normalizeGuildTagList(rawTopics),
    structure: parseGuildStructure(raw),
  };
}

/**
 * Merge a partial `x.onsocial` patch into existing group config `x`.
 * Contract used to shallow-replace `x`, which wiped banner when rooms saved
 * (and structure when banner saved). App merges before send; contract now
 * deep-merges too.
 */
export function mergeGuildOnsocialMetadataPatch(
  existingConfig: Record<string, unknown> | null | undefined,
  onsocialPatch: Record<string, unknown>
): { x: { onsocial: Record<string, unknown> } } {
  const existingX = readRecord(existingConfig?.x);
  const existingOnsocial = readRecord(existingX?.onsocial) ?? {};
  return {
    x: {
      onsocial: {
        ...existingOnsocial,
        ...onsocialPatch,
      },
    },
  };
}

/** Guild topics — first is primary; hard cap keeps cards scannable. */
export const GUILD_MAX_TOPICS = TOPIC_MAX_PER_ENTITY;

/** Suggested topics for create/edit (same catalog as hubs). */
export const GUILD_TOPIC_SUGGESTIONS = COMMUNITY_TOPIC_SUGGESTIONS;

/** Static All + suggestions (create/editor). Discover uses live used counts. */
export const GUILD_TOPIC_FILTERS: ReadonlyArray<{
  id: 'all' | string;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  ...GUILD_TOPIC_SUGGESTIONS.map((entry) => ({
    id: entry.id,
    label: entry.label,
  })),
];

export function guildTopicLabel(topic: string | null | undefined): string | null {
  return topicLabel(topic, GUILD_TOPIC_SUGGESTIONS);
}

/** Display name — short enough for hero + cards. */
export const GUILD_MAX_NAME_LENGTH = 64;

/**
 * Guild description — longer than profile bio (180), short enough for a
 * 2-line hero clamp with “more”. UI-enforced; contract stores free-form string.
 */
export const GUILD_MAX_DESCRIPTION_LENGTH = 240;

export function normalizeGuildTagList(tags: unknown): string[] {
  return normalizeTopicList(tags, GUILD_MAX_TOPICS);
}

export function normalizeGuildTagsInput(input: string): string[] {
  return normalizeGuildTagList(input.split(/[,\s]+/));
}

export function guildTagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag === b[index]);
}
