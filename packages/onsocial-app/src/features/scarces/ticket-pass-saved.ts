/**
 * Saved Show-pass code.
 * Signed once with the holder's App session key and kept on this device
 * so the guest can show it with no signal. The door still checks the
 * signature against the current owner, then admits once.
 */

/** Matches the App social session lifetime. */
export const TICKET_PASS_SAVED_MAX_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Door can still scan shortly after the listed end. */
export const TICKET_PASS_EVENT_GRACE_MS = 36 * 60 * 60 * 1000;
/** Reject proofs dated further out than we ever sign. */
export const TICKET_PASS_SAVED_MAX_AHEAD_MS =
  TICKET_PASS_SAVED_MAX_TTL_MS + 24 * 60 * 60 * 1000;

const STORAGE_KEY = 'onsocial.ticket-pass.v1';

export interface SavedTicketPass {
  tokenId: string;
  ownerId: string;
  payload: string;
  expMs: number;
}

type TicketPassStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function ticketPassSavedTtlMs(opts: {
  nowMs: number;
  eventEndsAtMs?: number | null;
}): number {
  const cap = TICKET_PASS_SAVED_MAX_TTL_MS;
  const end = opts.eventEndsAtMs;
  if (end == null || !Number.isFinite(end) || end <= 0) return cap;
  const until = Math.floor(end + TICKET_PASS_EVENT_GRACE_MS - opts.nowMs);
  // Show already finished — memberships and coupons keep the long window.
  // On-chain validity still blocks a dead ticket at the door.
  if (until < 60 * 60 * 1000) return cap;
  return Math.min(cap, until);
}

function defaultStore(): TicketPassStore | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readAll(storage: TicketPassStore): Record<string, unknown> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function isSavedTicketPass(value: unknown): value is SavedTicketPass {
  if (!value || typeof value !== 'object') return false;
  const row = value as SavedTicketPass;
  return (
    typeof row.tokenId === 'string' &&
    row.tokenId.trim().length > 0 &&
    typeof row.ownerId === 'string' &&
    row.ownerId.trim().length > 0 &&
    typeof row.payload === 'string' &&
    row.payload.startsWith('os2|') &&
    typeof row.expMs === 'number' &&
    Number.isFinite(row.expMs) &&
    row.expMs > 0
  );
}

export function readSavedTicketPass(
  tokenId: string,
  storage: TicketPassStore | null = defaultStore()
): SavedTicketPass | null {
  const id = tokenId.trim();
  if (!id || !storage) return null;
  const row = readAll(storage)[id];
  if (!isSavedTicketPass(row)) return null;
  if (row.tokenId.trim() !== id) return null;
  return row;
}

export function writeSavedTicketPass(
  record: SavedTicketPass,
  storage: TicketPassStore | null = defaultStore()
): void {
  const id = record.tokenId.trim();
  if (!id || !storage || !isSavedTicketPass(record)) return;
  const next = readAll(storage);
  next[id] = {
    tokenId: id,
    ownerId: record.ownerId.trim(),
    payload: record.payload.trim(),
    expMs: Math.floor(record.expMs),
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — the open pass still shows this session */
  }
}

export function clearSavedTicketPass(
  tokenId: string,
  storage: TicketPassStore | null = defaultStore()
): void {
  const id = tokenId.trim();
  if (!id || !storage) return;
  const next = readAll(storage);
  if (!(id in next)) return;
  delete next[id];
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
