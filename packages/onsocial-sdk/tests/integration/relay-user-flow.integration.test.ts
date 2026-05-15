// ---------------------------------------------------------------------------
// Integration: canonical OnAPI user write flow
//
// Proves the production path used by normal SDK consumers:
//   OnAPI key auth -> attached NEP-366 session -> gateway /relay/delegate
//   -> private relayer /execute_delegate -> direct + indexed confirmation.
//
// This file should stay small. Domain integration suites can assume this lane
// works and focus on product behavior.
// ---------------------------------------------------------------------------

import { beforeAll, describe, expect, it } from 'vitest';
import type { OnSocial } from '../../src/client.js';
import { groupConfigV1 } from '../../src/schema/v1.js';
import {
  ACCOUNT_ID,
  confirmDirect,
  confirmIndexed,
  getRelayedClient,
  INTEGRATION_SETUP_TIMEOUT_MS,
  testId,
} from './helpers.js';

describe('canonical relayed user flow', () => {
  let os: OnSocial;
  const groupId = `relay_smoke_${testId()}`;

  beforeAll(async () => {
    os = await getRelayedClient();
  }, INTEGRATION_SETUP_TIMEOUT_MS);

  it('writes through the default gateway relay path and confirms direct + indexed state', async () => {
    expect(os.session).toBeTruthy();

    const result = await os.groups.create(
      groupId,
      groupConfigV1({
        name: `Relay Smoke ${groupId}`,
        description: 'Canonical SDK OnAPI + session delegate smoke test',
        isPrivate: false,
        memberDriven: false,
        tags: ['integration', 'relay', 'sdk'],
      })
    );

    expect(result.txHash).toBeTruthy();

    const directConfig = await confirmDirect(async () => {
      const value = await os.groups.getConfig(groupId);
      return value?.name === `Relay Smoke ${groupId}` ? value : null;
    }, 'relay smoke group config');

    expect(directConfig?.description).toBe(
      'Canonical SDK OnAPI + session delegate smoke test'
    );

    const indexedEvent = await confirmIndexed(async () => {
      const value = await os.query.graphql<{
        groupUpdates: Array<{
          groupId: string;
          operation: string;
          author: string;
        }>;
      }>({
        query: `query RelaySmokeGroupCreate($groupId: String!, $author: String!) {
          groupUpdates(
            where: {
              groupId: {_eq: $groupId},
              author: {_eq: $author},
              operation: {_eq: "create_group"}
            },
            limit: 1,
            orderBy: [{blockHeight: DESC}]
          ) {
            groupId
            operation
            author
          }
        }`,
        variables: { groupId, author: ACCOUNT_ID },
      });
      return value.data?.groupUpdates?.[0] ?? null;
    }, 'relay smoke group create event');

    expect(indexedEvent).toEqual({
      groupId,
      operation: 'create_group',
      author: ACCOUNT_ID,
    });
  }, 60_000);
});
