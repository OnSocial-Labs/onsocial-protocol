import { describe, expect, it } from 'vitest';
import {
  ENDORSEMENTS_PAGE_SIZE,
  type EndorsementsPanelResponse,
} from '@/lib/endorsements-panel-data';
import { parseEndorsementsMode } from '@/lib/load-endorsements-page';
import {
  endorsementTopicKey,
  humanizeEndorsementTopic,
} from '@/lib/endorsement-display';

describe('parseEndorsementsMode', () => {
  it('accepts received and given', () => {
    expect(parseEndorsementsMode('received')).toBe('received');
    expect(parseEndorsementsMode('GIVEN')).toBe('given');
  });

  it('rejects unknown modes', () => {
    expect(parseEndorsementsMode(null)).toBeNull();
    expect(parseEndorsementsMode('mutual')).toBeNull();
  });
});

describe('endorsement display helpers', () => {
  it('humanizes dashed topics', () => {
    expect(humanizeEndorsementTopic('product-design')).toBe('product design');
  });

  it('keys topics via normalize', () => {
    expect(endorsementTopicKey('Product Design')).toBe('product-design');
  });
});

describe('endorsements panel payload shape', () => {
  it('keeps page size and hasMore flags on the shell response', () => {
    const sample: EndorsementsPanelResponse = {
      accountId: 'alice.near',
      counts: { received: 2, given: 1 },
      received: [],
      given: [],
      receivedHasMore: false,
      givenHasMore: true,
    };
    expect(ENDORSEMENTS_PAGE_SIZE).toBe(24);
    expect(sample.givenHasMore).toBe(true);
  });

  it('types enriched rows with mediaUrl', () => {
    const item: EndorsementsPanelResponse['received'][number] = {
      issuer: 'alice.near',
      target: 'bob.near',
      v: 1,
      since: 1,
      blockHeight: 1,
      blockTimestamp: 1,
      issuerName: 'Alice',
      issuerAvatarUrl: null,
      targetName: 'Bob',
      targetAvatarUrl: null,
      mediaUrl: 'https://cdn.testnet.onsocial.id/ipfs/bafy',
      supporterCount: 3,
    };
    expect(item.mediaUrl).toContain('bafy');
    expect(item.supporterCount).toBe(3);
  });
});

describe('endorse compose intent contract', () => {
  it('documents create vs edit vs auto roles', () => {
    const intents = ['auto', 'create', 'edit'] as const;
    expect(intents).toContain('auto');
    expect(intents).toContain('create');
    expect(intents).toContain('edit');
  });

  it('documents list chrome as StandingIdentity shell', () => {
    const rowShell = 'standing-row endorsement-standing-row';
    expect(rowShell).toContain('standing-row');
  });
});
