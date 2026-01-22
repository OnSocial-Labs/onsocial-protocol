// tests/graph.integration.test.ts
// Integration test for The Graph subgraph (runs against real testnet subgraph)

import { describe, it, expect } from 'vitest';
import { GraphClient, NETWORKS } from '../src';

// Always run - testnet subgraph is public
describe('GraphClient Integration', () => {
  const client = new GraphClient({ network: 'testnet' });

  it('should connect to testnet subgraph', async () => {
    // Just verify we can reach the subgraph
    const result = await client.customQuery<{ _meta: { block: { number: number } } }>(
      '{ _meta { block { number } } }'
    );
    expect(result._meta.block.number).toBeGreaterThan(0);
  }, 30000);

  it('should query data updates for contract', async () => {
    // Query updates for the contract itself
    const updates = await client.getDataUpdates(NETWORKS.testnet.contractId, { first: 5 });
    expect(Array.isArray(updates)).toBe(true);
    // May be empty if no activity, but should not throw
  }, 30000);

  it('should query account (may be null)', async () => {
    // Query the contract's own account - should exist if subgraph is synced
    const account = await client.getAccount(NETWORKS.testnet.contractId);
    // Account may or may not exist depending on indexing state
    expect(account === null || typeof account?.id === 'string').toBe(true);
  }, 30000);

  it('should query recent activity', async () => {
    // getRecentActivity takes a number, not an options object
    const activity = await client.getRecentActivity(3);
    expect(Array.isArray(activity)).toBe(true);
  }, 30000);

  it('should handle non-existent account gracefully', async () => {
    const account = await client.getAccount('definitely-does-not-exist-12345.near');
    expect(account).toBeNull();
  }, 30000);
});
