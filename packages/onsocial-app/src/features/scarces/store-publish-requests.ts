'use client';

/**
 * Off-chain request-to-publish for stores.
 * Creators write `scarces/store-request/{appId}` via social.set;
 * owners/mods discover pending requests with query.raw.byJsonContains
 * and approve on-chain via addApprovedCreator.
 *
 * Decline: staff write `scarces/store-decision/{appId}/{requesterId}`
 * (their own account) with status rejected + the request's requestedAt.
 * A newer request supersedes that decline.
 */

import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export const STORE_REQUEST_DATA_TYPE = 'scarces';

export type StorePublishRequestStatus = 'pending' | 'withdrawn' | 'approved';

export type StorePublishDecisionStatus = 'rejected';

export interface StorePublishRequest {
  appId: string;
  requesterId: string;
  message: string;
  status: StorePublishRequestStatus;
  requestedAt: number;
  path: string;
}

export interface StorePublishDecision {
  appId: string;
  requesterId: string;
  status: StorePublishDecisionStatus;
  /** Fingerprint of the request that was declined. */
  requestRequestedAt: number;
  decidedAt: number;
  path: string;
  deciderId: string;
}

export function storeRequestPath(appId: string): string {
  return `scarces/store-request/${appId.trim()}`;
}

export function storeDecisionPath(appId: string, requesterId: string): string {
  return `scarces/store-decision/${appId.trim()}/${requesterId.trim()}`;
}

function parseRequest(
  accountId: string,
  path: string,
  value: string
): StorePublishRequest | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const appId = typeof parsed.appId === 'string' ? parsed.appId.trim() : '';
    if (!appId) return null;
    const statusRaw =
      typeof parsed.status === 'string' ? parsed.status.trim() : 'pending';
    const status: StorePublishRequestStatus =
      statusRaw === 'withdrawn' || statusRaw === 'approved'
        ? statusRaw
        : 'pending';
    const message =
      typeof parsed.message === 'string' ? parsed.message.trim() : '';
    const requestedAt =
      typeof parsed.requestedAt === 'number' &&
      Number.isFinite(parsed.requestedAt)
        ? parsed.requestedAt
        : Date.now();
    return {
      appId,
      requesterId: accountId,
      message,
      status,
      requestedAt,
      path,
    };
  } catch {
    return null;
  }
}

function parseDecision(
  deciderId: string,
  path: string,
  value: string
): StorePublishDecision | null {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const appId = typeof parsed.appId === 'string' ? parsed.appId.trim() : '';
    const requesterId =
      typeof parsed.requesterId === 'string' ? parsed.requesterId.trim() : '';
    if (!appId || !requesterId) return null;
    if (parsed.status !== 'rejected') return null;
    const requestRequestedAt =
      typeof parsed.requestRequestedAt === 'number' &&
      Number.isFinite(parsed.requestRequestedAt)
        ? parsed.requestRequestedAt
        : 0;
    const decidedAt =
      typeof parsed.decidedAt === 'number' && Number.isFinite(parsed.decidedAt)
        ? parsed.decidedAt
        : 0;
    if (requestRequestedAt <= 0 || decidedAt <= 0) return null;
    return {
      appId,
      requesterId,
      status: 'rejected',
      requestRequestedAt,
      decidedAt,
      path,
      deciderId,
    };
  } catch {
    return null;
  }
}

/** True when a decline still applies to this pending request. */
export function isStorePublishRequestRejected(
  request: Pick<StorePublishRequest, 'requesterId' | 'requestedAt'>,
  decisions: readonly StorePublishDecision[]
): boolean {
  const requester = request.requesterId.trim().toLowerCase();
  return decisions.some(
    (decision) =>
      decision.status === 'rejected' &&
      decision.requesterId.trim().toLowerCase() === requester &&
      decision.requestRequestedAt >= request.requestedAt
  );
}

/** Pending requests that still need a grant (not approved, not declined). */
export function filterActionablePublishRequests(
  rows: readonly StorePublishRequest[],
  approvedCreatorIds: readonly string[],
  decisions: readonly StorePublishDecision[] = []
): StorePublishRequest[] {
  const approved = new Set(
    approvedCreatorIds.map((id) => id.trim().toLowerCase()).filter(Boolean)
  );
  return rows.filter((row) => {
    const requester = row.requesterId.trim().toLowerCase();
    return (
      row.status === 'pending' &&
      !approved.has(requester) &&
      !isStorePublishRequestRejected(row, decisions)
    );
  });
}

/** Pending (and recent) publish requests for a store, newest first. */
export async function fetchStorePublishRequests(
  appId: string,
  opts: { limit?: number } = {}
): Promise<StorePublishRequest[]> {
  const id = appId.trim();
  if (!id) return [];
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.raw.byJsonContains(
      STORE_REQUEST_DATA_TYPE,
      { appId: id },
      { limit: opts.limit ?? 40 }
    );
    const byRequester = new Map<string, StorePublishRequest>();
    for (const row of rows) {
      if (!row.path.includes(`/store-request/${id}`)) continue;
      const request = parseRequest(row.accountId, row.path, row.value);
      if (!request || request.appId !== id) continue;
      const existing = byRequester.get(request.requesterId);
      if (!existing || request.requestedAt >= existing.requestedAt) {
        byRequester.set(request.requesterId, request);
      }
    }
    return [...byRequester.values()].sort(
      (a, b) => b.requestedAt - a.requestedAt
    );
  } catch {
    return [];
  }
}

/** Staff decline notes for a store (newest decision wins per requester). */
export async function fetchStorePublishDecisions(
  appId: string,
  opts: { limit?: number } = {}
): Promise<StorePublishDecision[]> {
  const id = appId.trim();
  if (!id) return [];
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.raw.byJsonContains(
      STORE_REQUEST_DATA_TYPE,
      { appId: id },
      { limit: opts.limit ?? 40 }
    );
    const byRequester = new Map<string, StorePublishDecision>();
    for (const row of rows) {
      if (!row.path.includes(`/store-decision/${id}/`)) continue;
      const decision = parseDecision(row.accountId, row.path, row.value);
      if (!decision || decision.appId !== id) continue;
      const key = decision.requesterId.trim().toLowerCase();
      const existing = byRequester.get(key);
      if (!existing || decision.decidedAt >= existing.decidedAt) {
        byRequester.set(key, decision);
      }
    }
    return [...byRequester.values()];
  } catch {
    return [];
  }
}

export async function fetchMyStorePublishRequest(
  appId: string,
  accountId: string
): Promise<StorePublishRequest | null> {
  const id = appId.trim();
  const account = accountId.trim();
  if (!id || !account) return null;
  try {
    const client = createReadOnlyOnSocialClient();
    const path = `${account}/${storeRequestPath(id)}`;
    const row = await client.query.raw.byPath(path);
    if (!row) return null;
    return parseRequest(row.accountId, row.path, row.value);
  } catch {
    return null;
  }
}

/** Latest decline for this requester on this hub, if any. */
export async function fetchMyStorePublishDecision(
  appId: string,
  requesterId: string
): Promise<StorePublishDecision | null> {
  const id = appId.trim();
  const requester = requesterId.trim();
  if (!id || !requester) return null;
  try {
    const client = createReadOnlyOnSocialClient();
    const rows = await client.query.raw.byJsonContains(
      STORE_REQUEST_DATA_TYPE,
      { appId: id, requesterId: requester },
      { limit: 12 }
    );
    let best: StorePublishDecision | null = null;
    for (const row of rows) {
      if (!row.path.includes(`/store-decision/${id}/`)) continue;
      const decision = parseDecision(row.accountId, row.path, row.value);
      if (!decision || decision.appId !== id) continue;
      if (
        decision.requesterId.trim().toLowerCase() !== requester.toLowerCase()
      ) {
        continue;
      }
      if (!best || decision.decidedAt >= best.decidedAt) best = decision;
    }
    return best;
  } catch {
    return null;
  }
}

export function buildStorePublishRequestPayload(opts: {
  appId: string;
  message?: string;
  status?: StorePublishRequestStatus;
}): Record<string, unknown> {
  return {
    appId: opts.appId.trim(),
    message: opts.message?.trim() ?? '',
    status: opts.status ?? 'pending',
    requestedAt: Date.now(),
  };
}

export function buildStorePublishDeclinePayload(opts: {
  appId: string;
  requesterId: string;
  requestRequestedAt: number;
}): Record<string, unknown> {
  return {
    appId: opts.appId.trim(),
    requesterId: opts.requesterId.trim(),
    status: 'rejected',
    requestRequestedAt: opts.requestRequestedAt,
    decidedAt: Date.now(),
  };
}
