import { describe, expect, it } from 'vitest';
import {
  deriveMutedAccountIds,
  recordViewerMute,
  reconcileViewerMute,
  resolveViewerMute,
  type ViewerMuteLedger,
} from '@/lib/viewer-mute-ledger';
import {
  deriveBlockedAccountIds,
  recordViewerBlock,
  type ViewerBlockLedger,
} from '@/lib/viewer-block-ledger';
import { filterHiddenAuthors } from '@/lib/viewer-mute-block-filter';
import {
  clearGlobalViewerMuteState,
  setGlobalApiMutedIds,
} from '@/lib/viewer-mute-global';
import {
  clearGlobalViewerBlockState,
  setGlobalApiBlockIds,
} from '@/lib/viewer-block-global';

describe('viewer mute/block ledgers', () => {
  it('resolves optimistic mute overrides', () => {
    const ledger: ViewerMuteLedger = new Map();
    expect(resolveViewerMute(ledger, 'bob.near', false)).toBe(false);
    recordViewerMute(ledger, 'bob.near', true);
    expect(resolveViewerMute(ledger, 'bob.near', false)).toBe(true);
    expect(reconcileViewerMute(ledger, 'bob.near', true)).toBe(true);
    expect(ledger.has('bob.near')).toBe(false);
  });

  it('derives muted ids from api + ledger', () => {
    const ledger: ViewerMuteLedger = new Map();
    recordViewerMute(ledger, 'carol.near', true);
    recordViewerMute(ledger, 'bob.near', false);
    expect(
      deriveMutedAccountIds(['bob.near', 'dave.near'], ledger).sort()
    ).toEqual(['carol.near', 'dave.near'].sort());
  });

  it('derives blocked ids similarly', () => {
    const ledger: ViewerBlockLedger = new Map();
    recordViewerBlock(ledger, 'eve.near', true);
    expect(deriveBlockedAccountIds([], ledger)).toEqual(['eve.near']);
  });

  it('filters hidden authors using global mute/block sets', () => {
    clearGlobalViewerMuteState();
    clearGlobalViewerBlockState();
    setGlobalApiMutedIds(['muted.near']);
    setGlobalApiBlockIds({
      outgoing: ['blocked.near'],
      incoming: ['blocker.near'],
    });
    const rows = [
      { accountId: 'muted.near' },
      { accountId: 'blocked.near' },
      { accountId: 'blocker.near' },
      { accountId: 'ok.near' },
    ];
    expect(filterHiddenAuthors(rows).map((r) => r.accountId)).toEqual([
      'ok.near',
    ]);
    clearGlobalViewerMuteState();
    clearGlobalViewerBlockState();
  });
});
