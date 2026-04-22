// ---------------------------------------------------------------------------
// Integration: Schema validation — Hasura introspection vs SDK expectations
//
// Fetches Hasura's GraphQL schema and verifies that all tables/columns the
// SDK queries actually exist. Catches drift between substreams SQL views,
// Hasura tracking, and SDK query code before it hits production.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

interface IntrospectionField {
  name: string;
}
interface IntrospectionType {
  name: string;
  fields: IntrospectionField[] | null;
}

// Tables/views the SDK queries, with the columns it expects
const SDK_EXPECTED_SCHEMA: Record<string, string[]> = {
  // query.ts → getProfile
  profilesCurrent: ['accountId', 'field', 'value', 'blockHeight'],
  // query.ts → getPosts, getFeed, getFilteredFeed, getGroupFeed
  postsCurrent: [
    'accountId',
    'postId',
    'value',
    'blockHeight',
    'blockTimestamp',
    'groupId',
    'parentAuthor',
    'parentPath',
    'refAuthor',
    'refPath',
    'channel',
    'kind',
    'audiences',
    'isGroupContent',
  ],
  // query.ts → getStandingWith, getStanders
  standingsCurrent: ['accountId', 'targetAccount', 'blockHeight'],
  // query.ts → getReactionCounts
  reactionCounts: ['reactionCount'],
  // query.ts → getStandingCounts
  standingCounts: ['accountId', 'standingWithCount'],
  standingOutCounts: ['accountId', 'standingWithOthersCount'],
  // query.ts → getReplies
  threadReplies: [
    'replyAuthor',
    'replyId',
    'parentAuthor',
    'parentPath',
    'blockHeight',
  ],
  // query.ts → getQuotes
  quotes: ['quoteAuthor', 'quoteId', 'refAuthor', 'refPath', 'blockHeight'],
  // query.ts → edges
  edgeCounts: ['accountId', 'edgeType', 'inboundCount'],
  // query.ts → raw data
  dataUpdates: ['accountId', 'path', 'value', 'operation', 'blockHeight'],
  // query.ts → hashtags
  postHashtags: ['accountId', 'postId', 'hashtag', 'blockHeight'],
  hashtagCounts: ['hashtag', 'postCount', 'lastBlock'],
  // query.ts → claims
  claimsCurrent: [
    'issuer',
    'subject',
    'claimType',
    'claimId',
    'value',
    'blockHeight',
  ],
  // query.ts → saves
  savesCurrent: [
    'accountId',
    'contentPath',
    'value',
    'blockHeight',
    'blockTimestamp',
    'operation',
  ],
  // query.ts → endorsements
  endorsementsCurrent: [
    'issuer',
    'target',
    'value',
    'blockHeight',
    'blockTimestamp',
    'operation',
  ],
};

let schemaTypes: Map<string, Set<string>>;

describe('schema validation', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();

    // Introspect Hasura via the SDK's http client (uses the shared API key)
    const result = await os.http.post<{
      data: { __schema: { types: IntrospectionType[] } };
    }>('/graph/query', {
      query: `{
        __schema {
          types {
            name
            fields { name }
          }
        }
      }`,
    });

    schemaTypes = new Map();
    for (const t of result.data.__schema.types) {
      if (t.fields) {
        const fieldNames = new Set(t.fields.map((f) => f.name));
        schemaTypes.set(t.name, fieldNames);
      }
    }
  });

  describe('core views', () => {
    for (const [table, expectedColumns] of Object.entries(
      SDK_EXPECTED_SCHEMA
    )) {
      describe(table, () => {
        it(`should exist in Hasura schema`, () => {
          const hasType = schemaTypes.has(table);
          if (!hasType) {
            // Try query_root fields approach
            const queryRoot = schemaTypes.get('query_root');
            expect(
              hasType || queryRoot?.has(table),
              `Table/view "${table}" not found in Hasura schema`
            ).toBeTruthy();
          }
        });

        for (const col of expectedColumns) {
          it(`should have column "${col}"`, () => {
            const fields = schemaTypes.get(table);
            if (fields) {
              expect(
                fields.has(col),
                `Column "${col}" missing from "${table}". Available: ${[...fields].join(', ')}`
              ).toBe(true);
            }
          });
        }
      });
    }
  });
});
