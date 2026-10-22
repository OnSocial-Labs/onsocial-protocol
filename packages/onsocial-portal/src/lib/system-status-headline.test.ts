import { describe, expect, it } from 'vitest';
import {
  deriveSystemHeadline,
  indexerLiveLabel,
  parseLiveHealthPayload,
  rpcLiveLabel,
} from '@/lib/system-status-headline';

const up = { status: 'up' as const };
const down = { status: 'down' as const };

describe('deriveSystemHeadline', () => {
  it('stays on Checking until both groups have finished', () => {
    expect(
      deriveSystemHeadline({
        servicesLoading: false,
        contractsLoading: true,
        services: [up],
        contracts: [],
        contractsUnavailable: false,
      })
    ).toBe('Checking');
  });

  it('says All Operational only when every row is up', () => {
    expect(
      deriveSystemHeadline({
        servicesLoading: false,
        contractsLoading: false,
        services: [up, up],
        contracts: [up],
        contractsUnavailable: false,
      })
    ).toBe('All Operational');
  });

  it('does not treat a missing contract check as operational', () => {
    expect(
      deriveSystemHeadline({
        servicesLoading: false,
        contractsLoading: false,
        services: [up],
        contracts: [],
        contractsUnavailable: true,
      })
    ).toBe('Degraded');
  });

  it('says Degraded when a contract or service is not up', () => {
    expect(
      deriveSystemHeadline({
        servicesLoading: false,
        contractsLoading: false,
        services: [up, down],
        contracts: [up],
        contractsUnavailable: false,
      })
    ).toBe('Degraded');
  });

  it('says Degraded when the live check is behind', () => {
    expect(
      deriveSystemHeadline({
        servicesLoading: false,
        contractsLoading: false,
        services: [up],
        contracts: [up],
        contractsUnavailable: false,
        live: [up, { status: 'degraded' }],
      })
    ).toBe('Degraded');
  });

  it('ignores the live check until the endpoint exists', () => {
    expect(
      deriveSystemHeadline({
        servicesLoading: false,
        contractsLoading: false,
        services: [up],
        contracts: [up],
        contractsUnavailable: false,
        live: null,
      })
    ).toBe('All Operational');
  });
});

describe('live health labels', () => {
  it('shows the node answer time and the indexer words', () => {
    expect(rpcLiveLabel('up', 14)).toBe('14ms');
    expect(rpcLiveLabel('degraded', 400)).toBe('Backup');
    expect(indexerLiveLabel('up')).toBe('At tip');
    expect(indexerLiveLabel('degraded')).toBe('Catching up');
  });

  it('accepts a live payload and drops a bad one', () => {
    expect(
      parseLiveHealthPayload({
        rpc: { status: 'up', ms: 14 },
        indexer: { status: 'degraded', lagBlocks: 40, height: 10 },
      })
    ).toEqual({
      rpc: { status: 'up', ms: 14 },
      indexer: { status: 'degraded', lagBlocks: 40, height: 10 },
    });
    expect(parseLiveHealthPayload({ error: 'Not found' })).toBeNull();
  });
});
