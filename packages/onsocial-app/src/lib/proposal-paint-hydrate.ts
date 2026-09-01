import {
  latestProposalPaintFromEvents,
  proposalRefKey,
  type ProposalIndexerEvent,
} from '@/features/guilds/proposal-indexer-events';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';
import type { ProposalPaintSnapshot } from '@/lib/post-display';

export type ProposalPaintRef = {
  groupId: string;
  proposalId: string;
};

const cache = new Map<string, ProposalPaintSnapshot | null>();
const listeners = new Set<() => void>();

function emitProposalPaintCache() {
  for (const listener of listeners) listener();
}

export function subscribeProposalPaintCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type Waiter = {
  refs: ProposalPaintRef[];
  resolve: (map: Map<string, ProposalPaintSnapshot | null>) => void;
  reject: (error: unknown) => void;
};

let queued: Waiter[] = [];
let flushScheduled = false;

function normalizeRef(ref: ProposalPaintRef): ProposalPaintRef | null {
  const groupId = ref.groupId.trim();
  const proposalId = ref.proposalId.trim();
  if (!groupId || !proposalId) return null;
  return { groupId, proposalId };
}

export function getCachedProposalPaint(
  groupId: string,
  proposalId: string
): ProposalPaintSnapshot | null | undefined {
  const ref = normalizeRef({ groupId, proposalId });
  if (!ref) return undefined;
  return cache.get(proposalRefKey(ref.groupId, ref.proposalId));
}

async function fetchProposalPaints(
  refs: ProposalPaintRef[]
): Promise<Map<string, ProposalPaintSnapshot | null>> {
  const out = new Map<string, ProposalPaintSnapshot | null>();
  if (refs.length === 0) return out;

  const variables: Record<string, string> = {};
  const orParts = refs.map((ref, index) => {
    variables[`g${index}`] = ref.groupId;
    variables[`p${index}`] = ref.proposalId;
    return `{ groupId: {_eq: $g${index}}, proposalId: {_eq: $p${index}} }`;
  });
  const varDefs = refs
    .flatMap((_, index) => [`$g${index}: String!`, `$p${index}: String!`])
    .join(', ');

  const client = createReadOnlyOnSocialClient();
  const res = await client.query.graphql<{
    groupUpdates: ProposalIndexerEvent[];
  }>({
    query: `query ProposalPaints(${varDefs}) {
      groupUpdates(
        where: {
          _or: [${orParts.join(', ')}],
          operation: {_in: ["proposal_created", "proposal_status_updated"]}
        },
        limit: ${Math.min(200, refs.length * 8)},
        orderBy: [{blockHeight: DESC}]
      ) {
        operation
        groupId
        proposalId
        title
        proposalType
        status
      }
    }`,
    variables,
  });

  const events = res.data?.groupUpdates ?? [];
  for (const ref of refs) {
    const key = proposalRefKey(ref.groupId, ref.proposalId);
    out.set(key, latestProposalPaintFromEvents(events, ref));
  }
  return out;
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    const waiters = queued;
    queued = [];
    const unique = new Map<string, ProposalPaintRef>();
    for (const waiter of waiters) {
      for (const ref of waiter.refs) {
        const key = proposalRefKey(ref.groupId, ref.proposalId);
        if (!cache.has(key)) unique.set(key, ref);
      }
    }

    void fetchProposalPaints([...unique.values()])
      .then((fetched) => {
        for (const [key, paint] of fetched) cache.set(key, paint);
        if (fetched.size > 0) emitProposalPaintCache();
        for (const waiter of waiters) {
          const map = new Map<string, ProposalPaintSnapshot | null>();
          for (const ref of waiter.refs) {
            const key = proposalRefKey(ref.groupId, ref.proposalId);
            map.set(key, cache.get(key) ?? null);
          }
          waiter.resolve(map);
        }
      })
      .catch((error) => {
        for (const waiter of waiters) waiter.reject(error);
      });
  });
}

/** Coalesces in-view chips into one Hasura query per tick. */
export function hydrateProposalPaints(
  refs: readonly ProposalPaintRef[]
): Promise<Map<string, ProposalPaintSnapshot | null>> {
  const normalized = refs
    .map((ref) => normalizeRef(ref))
    .filter((ref): ref is ProposalPaintRef => Boolean(ref));

  if (normalized.length === 0) {
    return Promise.resolve(new Map());
  }

  const allCached = normalized.every((ref) =>
    cache.has(proposalRefKey(ref.groupId, ref.proposalId))
  );
  if (allCached) {
    const map = new Map<string, ProposalPaintSnapshot | null>();
    for (const ref of normalized) {
      const key = proposalRefKey(ref.groupId, ref.proposalId);
      map.set(key, cache.get(key) ?? null);
    }
    return Promise.resolve(map);
  }

  return new Promise((resolve, reject) => {
    queued.push({ refs: normalized, resolve, reject });
    scheduleFlush();
  });
}
