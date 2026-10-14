import { describe, expect, it } from 'vitest';
import {
  TICKET_PASS_EVENT_GRACE_MS,
  TICKET_PASS_SAVED_MAX_TTL_MS,
  clearSavedTicketPass,
  readSavedTicketPass,
  ticketPassSavedTtlMs,
  writeSavedTicketPass,
  type SavedTicketPass,
} from '@/features/scarces/ticket-pass-saved';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

const sample: SavedTicketPass = {
  tokenId: 'night-drive:3',
  ownerId: 'alice.testnet',
  payload: 'os2|night-drive|night-drive:3|1|pk|nonce|sig',
  expMs: 1_700_000_000_000,
};

describe('ticket-pass-saved', () => {
  it('keeps a pass through the show, then caps at the session window', () => {
    const nowMs = 1_700_000_000_000;
    expect(ticketPassSavedTtlMs({ nowMs })).toBe(TICKET_PASS_SAVED_MAX_TTL_MS);
    const inTwoDays = nowMs + 2 * 24 * 60 * 60 * 1000;
    expect(ticketPassSavedTtlMs({ nowMs, eventEndsAtMs: inTwoDays })).toBe(
      2 * 24 * 60 * 60 * 1000 + TICKET_PASS_EVENT_GRACE_MS
    );
    expect(
      ticketPassSavedTtlMs({
        nowMs,
        eventEndsAtMs: nowMs + 200 * 24 * 60 * 60 * 1000,
      })
    ).toBe(TICKET_PASS_SAVED_MAX_TTL_MS);
    expect(
      ticketPassSavedTtlMs({
        nowMs,
        eventEndsAtMs: nowMs - 3 * 24 * 60 * 60 * 1000,
      })
    ).toBe(TICKET_PASS_SAVED_MAX_TTL_MS);
  });

  it('stores one code per seat and drops it when cleared', () => {
    const storage = memoryStore();
    expect(readSavedTicketPass(sample.tokenId, storage)).toBeNull();
    writeSavedTicketPass(sample, storage);
    expect(readSavedTicketPass(sample.tokenId, storage)).toEqual(sample);
    writeSavedTicketPass(
      { ...sample, payload: 'os2|night-drive|night-drive:3|2|pk|nonce|sig' },
      storage
    );
    expect(readSavedTicketPass('other:1', storage)).toBeNull();
    expect(readSavedTicketPass(sample.tokenId, storage)?.payload).toContain(
      '|2|'
    );
    clearSavedTicketPass(sample.tokenId, storage);
    expect(readSavedTicketPass(sample.tokenId, storage)).toBeNull();
  });

  it('ignores damaged stored rows', () => {
    const storage = memoryStore();
    storage.setItem(
      'onsocial.ticket-pass.v1',
      JSON.stringify({
        'night-drive:3': { tokenId: 'night-drive:3', payload: 'os1:nope' },
      })
    );
    expect(readSavedTicketPass('night-drive:3', storage)).toBeNull();
  });
});
