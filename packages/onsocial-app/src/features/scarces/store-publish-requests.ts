'use client';

/**
 * Off-chain request-to-publish for stores.
 * Creators write `scarces/store-request/{appId}` via social.set;
 * owners/mods discover pending requests with query.raw.byJsonContains
 * and approve on-chain via addApprovedCreator.
 */

import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export const STORE_REQUEST_DATA_TYPE = 'scarces';

export type StorePublishRequestStatus = 'pending' | 'withdrawn' | 'approved';

export interface StorePublishRequest {
  appId: string;
  requesterId: string;
  message: string;
  status: StorePublishRequestStatus;
  requestedAt: number;
  path: string;
}

export function storeRequestPath(appId: string): string {
  return `scarces/store-request/${appId.trim()}`;
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
