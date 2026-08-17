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
  reconcileViewerBlock,
  type ViewerBlockLedger,
} from '@/lib/viewer-block-ledger';
import {
  filterHiddenAuthors,
  isBlockEitherWay,
  isViewerBlocking,
  isViewerMuting,
} from '@/lib/viewer-mute-block-filter';
import {
  clearGlobalViewerMuteState,
  getGlobalViewerMuteLedger,
  setGlobalApiMutedIds,
} from '@/lib/viewer-mute-global';
import {
  clearGlobalViewerBlockState,
  getGlobalViewerBlockLedger,
  setGlobalApiBlockIds,
} from '@/lib/viewer-block-global';
import { getGlobalViewerStandingLedger } from '@/lib/viewer-standing-global';
import {
  recordViewerStanding,
  resolveViewerStanding,
} from '@/lib/viewer-standing-ledger';

describe('viewer mute/block ledgers', () => {
  it('resolves optimistic mute overrides', () => {
    const ledger: ViewerMuteLedger = new Map();
    expect(resolveViewerMute(ledger, 'bob.near', false)).toBe(false);
    recordViewerMute(ledger, 'bob.near', true);
    expect(resolveViewerMute(ledger, 'bob.near', false)).toBe(true);
    expect(reconcileViewerMute(ledger, 'bob.near', true)).toBe(true);
    expect(ledger.has('bob.near')).toBe(false);
  });

  it('reconciles unmute when api no longer lists the target', () => {
    const ledger: ViewerMuteLedger = new Map();
    recordViewerMute(ledger, 'bob.near', false);
    expect(reconcileViewerMute(ledger, 'bob.near', false)).toBe(true);
    expect(ledger.has('bob.near')).toBe(false);
  });

  it('reconciles unblock when api no longer lists the target', () => {
    const ledger: ViewerBlockLedger = new Map();
    recordViewerBlock(ledger, 'bob.near', false);
    expect(reconcileViewerBlock(ledger, 'bob.near', false)).toBe(true);
    expect(ledger.has('bob.near')).toBe(false);
  });

  it('normalizes casing when recording mute/block keys', () => {
    const muteLedger: ViewerMuteLedger = new Map();
    recordViewerMute(muteLedger, 'Bob.NEAR', true);
    expect(resolveViewerMute(muteLedger, 'bob.near', false)).toBe(true);

    const blockLedger: ViewerBlockLedger = new Map();
    recordViewerBlock(blockLedger, 'Bob.NEAR', true);
    expect(blockLedger.has('bob.near')).toBe(true);
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

describe('isBlockEitherWay / stand guard helpers', () => {
  it('is true for outgoing or incoming blocks', () => {
    clearGlobalViewerBlockState();
    setGlobalApiBlockIds({
      outgoing: ['bob.near'],
      incoming: [],
    });
    expect(isBlockEitherWay('bob.near')).toBe(true);
    expect(isViewerBlocking('bob.near')).toBe(true);

    setGlobalApiBlockIds({
      outgoing: [],
      incoming: ['carol.near'],
    });
    expect(isBlockEitherWay('carol.near')).toBe(true);
    expect(isViewerBlocking('carol.near')).toBe(false);
    expect(isBlockEitherWay('dave.near')).toBe(false);
    clearGlobalViewerBlockState();
  });

  it('matches the updateStanding refuse condition', () => {
    clearGlobalViewerBlockState();
    setGlobalApiBlockIds({ outgoing: [], incoming: ['bob.near'] });
    const shouldStand = true;
    const blocked =
      shouldStand && isBlockEitherWay('bob.near')
        ? 'Standing is unavailable while a block is in place.'
        : null;
    expect(blocked).toBe('Standing is unavailable while a block is in place.');
    clearGlobalViewerBlockState();
  });
});

describe('block clears outbound standing ledger', () => {
  it('records standing false after a confirmed block', () => {
    const standing = getGlobalViewerStandingLedger();
    standing.clear();
    clearGlobalViewerBlockState();
    recordViewerStanding(standing, 'bob.near', true);
    expect(resolveViewerStanding(standing, 'bob.near', false)).toBe(true);

    // Mirrors useViewerBlock after trackTransaction confirms.
    recordViewerBlock(getGlobalViewerBlockLedger(), 'bob.near', true);
    recordViewerStanding(standing, 'bob.near', false);

    expect(isViewerBlocking('bob.near')).toBe(true);
    expect(resolveViewerStanding(standing, 'bob.near', true)).toBe(false);
    expect(isBlockEitherWay('bob.near')).toBe(true);

    standing.clear();
    clearGlobalViewerBlockState();
  });
});

describe('isViewerMuting', () => {
  it('reads optimistic mute ledger over api', () => {
    clearGlobalViewerMuteState();
    setGlobalApiMutedIds([]);
    recordViewerMute(getGlobalViewerMuteLedger(), 'bob.near', true);
    expect(isViewerMuting('bob.near')).toBe(true);
    clearGlobalViewerMuteState();
  });
});
