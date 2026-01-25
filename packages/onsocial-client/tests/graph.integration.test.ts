// tests/graph.integration.test.ts
// Integration test for Hasura (runs against real testnet Hasura instance)
//
// NOTE: Requires HASURA_ADMIN_SECRET environment variable for authenticated queries.
// The Hasura instance must be configured with graphql-default naming convention.

import { describe, it, expect } from 'vitest';
import { GraphClient, NETWORKS } from '../src';

// Skip if no admin secret (required for Hasura)
const hasuraAdminSecret = process.env.HASURA_ADMIN_SECRET;
const describeIfHasura = hasuraAdminSecret ? describe : describe.skip;

describeIfHasura('GraphClient Integration', () => {
  const client = new GraphClient({
    network: 'testnet',
    hasuraAdminSecret,
  });

  it('should connect to testnet Hasura and get indexer status', async () => {
    // Verify we can reach Hasura and the indexer is running
    const status = await client.getIndexerStatus();
    // Cursor should exist if indexer is running
    expect(status === null || typeof status?.blockNum === 'number').toBe(true);
  }, 30000);

  it('should query data updates', async () => {
    // Query recent activity - should return array
    const updates = await client.getRecentActivity(5);
    expect(Array.isArray(updates)).toBe(true);
    // May be empty if no activity, but should not throw
  }, 30000);

  it('should query storage updates', async () => {
    // Query storage updates by operation
    const deposits = await client.getStorageByOperation('deposit', 5);
    expect(Array.isArray(deposits)).toBe(true);
  }, 30000);

  it('should query group updates', async () => {
    // Query any group updates
    const customResult = await client.customQuery<{ groupUpdates: unknown[] }>(
      `query { groupUpdates(limit: 5, orderBy: { blockTimestamp: DESC }) { id operation groupId } }`
    );
    expect(Array.isArray(customResult.groupUpdates)).toBe(true);
  }, 30000);

  it('should handle empty results gracefully', async () => {
    // Query for a non-existent account
    const updates = await client.getDataUpdates('definitely-does-not-exist-12345.near');
    expect(Array.isArray(updates)).toBe(true);
    expect(updates.length).toBe(0);
  }, 30000);
});
