import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const aheadSrc = readFileSync(join(here, 'show-pass-ahead.ts'), 'utf8');
const owned = readFileSync(join(here, 'owned-show-pass-sheet.tsx'), 'utf8');
const sheet = readFileSync(join(here, 'ticket-show-pass-sheet.tsx'), 'utf8');
const panel = readFileSync(join(here, 'collection-page-panel.tsx'), 'utf8');
const holding = readFileSync(
  join(here, '../collectibles/collectibles-holding-row.tsx'),
  'utf8'
);

vi.mock('@/features/scarces/collections-data', () => ({
  fetchCollectionPreferIndexer: vi.fn(async (collectionId: string) => ({
    collectionId,
    creatorId: 'creator.testnet',
    title: `Drop ${collectionId}`,
    mediaUrl: null,
    priceNear: null,
    priceYocto: '0',
    totalSupply: 1,
    minted: 1,
    remaining: 0,
    startTimeMs: null,
    endTimeMs: null,
    eventStartsAtMs: null,
    eventEndsAtMs: null,
    place: null,
    kind: 'ticket',
  })),
}));

vi.mock('@/features/scarces/ticket-token-status', () => ({
  fetchTicketTokenStatus: vi.fn(async (tokenId: string) => ({
    tokenId,
    ownerId: 'owner.testnet',
    creatorId: 'creator.testnet',
    minterId: 'owner.testnet',
    collectionId: 'c',
    title: 'Pass',
    mediaUrl: null,
    isValid: true,
    isRevoked: false,
    isExpired: false,
    isFullyRedeemed: false,
    isRefunded: false,
    redeemCount: 0,
    maxRedeems: 1,
  })),
}));

describe('Show pass ahead', () => {
  it('exposes peek + prefetch like drop read-ahead', () => {
    expect(aheadSrc).toContain('export function peekShowPassSchedule');
    expect(aheadSrc).toContain('export function peekShowPassStatus');
    expect(aheadSrc).toContain('export function prefetchShowPass');
    expect(aheadSrc).toContain('revalidateStatus');
    expect(aheadSrc).toContain('fetchTicketTokenStatus');
    expect(aheadSrc).toContain('fetchCollectionPreferIndexer');
    expect(aheadSrc).toContain('const MAX = 48');
    expect(aheadSrc).toContain('rememberLru');
  });

  it('opens from peek and warms from the holding / drop', () => {
    expect(owned).toContain('peekShowPassSchedule');
    expect(owned).toContain('prefetchShowPass');
    expect(sheet).toContain('peekShowPassStatus');
    expect(sheet).toContain('prefetchShowPass');
    expect(sheet).toContain('revalidateStatus: true');
    expect(holding).toContain('prefetchShowPass');
    expect(panel).toContain('prefetchShowPass');
  });

  it('keeps only 48 schedule + status entries (collection-view LRU band)', async () => {
    const {
      clearShowPassAhead,
      peekShowPassSchedule,
      peekShowPassStatus,
      prefetchShowPass,
    } = await import('@/features/scarces/show-pass-ahead');

    clearShowPassAhead();
    for (let i = 0; i < 49; i += 1) {
      await prefetchShowPass({
        collectionId: `drop-${i}`,
        tokenId: `token-${i}`,
      });
    }

    expect(peekShowPassSchedule('drop-0')).toBeNull();
    expect(peekShowPassStatus('token-0')).toBeNull();
    expect(peekShowPassSchedule('drop-48')?.title).toBe('Drop drop-48');
    expect(peekShowPassStatus('token-48')?.status?.tokenId).toBe('token-48');
    clearShowPassAhead();
  });
});

afterEach(async () => {
  const { clearShowPassAhead } = await import(
    '@/features/scarces/show-pass-ahead'
  );
  clearShowPassAhead();
});
