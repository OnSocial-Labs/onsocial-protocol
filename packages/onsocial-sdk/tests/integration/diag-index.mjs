// Diagnostic — run with:
//   pnpm --filter @onsocial/sdk exec node tests/integration/diag-index.mjs
//
// Writes a post and polls every relevant indexed view so we can see:
//   • does the row land in `data_updates` at all?
//   • does it land in `posts_current` (postsCurrent in GraphQL)?
//   • do channel/kind/audiences columns get populated?
//   • is filtered feed lookup finding it?
//
// Prints raw GraphQL responses; never throws.

import { OnSocial } from '../../dist/client.js';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://testnet.onsocial.id';
const ACCOUNT_ID = process.env.ACCOUNT_ID || 'test01.onsocial.testnet';

function resolveServiceKey() {
  if (process.env.ONSOCIAL_API_KEY) return process.env.ONSOCIAL_API_KEY;
  try {
    const gcloud = path.join(process.env.HOME, 'google-cloud-sdk/bin/gcloud');
    return execSync(
      `${gcloud} secrets versions access latest --secret=ONSOCIAL_SERVICE_ONAPI_KEY`,
      { encoding: 'utf8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch {
    return undefined;
  }
}

const apiKey = resolveServiceKey();
if (!apiKey) {
  console.error('No ONSOCIAL_API_KEY available — aborting');
  process.exit(2);
}

const os = new OnSocial({
  network: 'testnet',
  gatewayUrl: GATEWAY_URL,
  apiKey,
  actorId: ACCOUNT_ID,
});

const postId = `diag_${Date.now()}`;
const fullPath = `${ACCOUNT_ID}/post/${postId}`;
const text = `diag ${postId}`;

console.log(`\n=== writing post ${postId} ===`);
const writeRes = await os.posts.create(
  { text, channel: 'music', audiences: ['public'] },
  postId
);
console.log('write response:', JSON.stringify(writeRes, null, 2));

console.log(`\n=== polling 30s ===`);
const deadline = Date.now() + 30_000;
let attempt = 0;
let foundPost = null;
let foundData = null;
let foundFiltered = null;

while (Date.now() < deadline) {
  attempt += 1;
  const elapsed = Math.round((30_000 - (deadline - Date.now())) / 100) / 10;

  // 1. raw data_updates table
  const byPath = await os.query
    .dataByPath(fullPath)
    .catch((e) => ({ error: String(e) }));
  const dataRows = byPath?.data?.dataUpdates ?? [];
  if (!foundData && dataRows.length > 0) {
    foundData = { attempt, elapsed, row: dataRows[0] };
    console.log(
      `[+${elapsed}s] dataByPath HIT (attempt ${attempt}):`,
      dataRows[0]
    );
  }

  // 2. postsCurrent view via os.query.feed.recent
  const page = await os.query
    .getPosts({ author: ACCOUNT_ID, limit: 50 })
    .catch((e) => ({ items: [], error: String(e) }));
  if (attempt === 4) {
    console.log(
      `[+${elapsed}s] os.query.feed.recent() returned ${page.items.length} items; first 3:`,
      page.items
        .slice(0, 3)
        .map((p) => ({ postId: p.postId, blockHeight: p.blockHeight }))
    );
  }
  const post = page.items.find((p) => p.postId === postId);
  if (!foundPost && post) {
    foundPost = { attempt, elapsed, row: post };
    console.log(`[+${elapsed}s] getPosts HIT (attempt ${attempt}):`, {
      postId: post.postId,
      channel: post.channel,
      kind: post.kind,
      audiences: post.audiences,
      blockHeight: post.blockHeight,
    });
  }

  // 2b. raw postsCurrent — no accountId filter, just look for our postId.
  if (!foundPost) {
    const raw = await os.query
      .graphql({
        query: `query Diag($pid: String!) {
          postsCurrent(where: {postId: {_eq: $pid}}) {
            accountId postId blockHeight channel kind audiences
          }
        }`,
        variables: { pid: postId },
      })
      .catch((e) => ({ data: null, error: String(e) }));
    const rawRows = raw?.data?.postsCurrent ?? [];
    if (rawRows.length > 0) {
      console.log(
        `[+${elapsed}s] RAW postsCurrent HIT (attempt ${attempt}):`,
        rawRows[0]
      );
      foundPost = { attempt, elapsed, row: rawRows[0], viaRaw: true };
    } else if (attempt === 4 || attempt === 12) {
      // Print what we actually see — every data_updates row for our path,
      // and the top postsCurrent rows for our account.
      const allRows = await os.query
        .graphql({
          query: `query DiagAll($path: String!, $author: String!) {
            dataUpdates(where: {path: {_eq: $path}}, orderBy: [{blockHeight: DESC}]) {
              path accountId dataType dataId operation blockHeight blockTimestamp
            }
            postsCurrent(where: {accountId: {_eq: $author}}, limit: 5, orderBy: [{blockHeight: DESC}]) {
              accountId postId blockHeight
            }
          }`,
          variables: { path: fullPath, author: ACCOUNT_ID },
        })
        .catch((e) => ({ data: null, error: String(e) }));
      console.log(
        `[+${elapsed}s] DEBUG dump:`,
        JSON.stringify(allRows?.data, null, 2)
      );
      if (allRows?.errors)
        console.log('graphql errors:', JSON.stringify(allRows.errors));

      // Replay the EXACT SDK query and dump the entire envelope.
      const sdkProbe = await os.query
        .graphql({
          query: `query Posts($author: String!, $limit: Int!, $offset: Int!) {
            postsCurrent(where: {accountId: {_eq: $author}}, limit: $limit, offset: $offset, orderBy: [{blockHeight: DESC}]) {
              accountId postId value blockHeight blockTimestamp receiptId
              parentPath parentAuthor parentType refPath refAuthor refType channel kind audiences
              groupId isGroupContent
            }
          }`,
          variables: { author: ACCOUNT_ID, limit: 50, offset: 0 },
        })
        .catch((e) => ({ data: null, error: String(e) }));
      console.log(
        `[+${elapsed}s] SDK-shaped query envelope:`,
        JSON.stringify({
          dataKeys: sdkProbe?.data ? Object.keys(sdkProbe.data) : null,
          rowCount: sdkProbe?.data?.postsCurrent?.length ?? null,
          errors: sdkProbe?.errors ?? null,
        })
      );
    }
  }

  // 3. filtered feed via standingWith=self+channel
  if (foundPost && !foundFiltered) {
    const filtered = await os.query
      .getFilteredFeed({
        accounts: [ACCOUNT_ID],
        channel: 'music',
        limit: 20,
      })
      .catch((e) => ({ items: [], error: String(e) }));
    const match = filtered.items?.find((p) => p.postId === postId);
    if (match) {
      foundFiltered = { attempt, elapsed, row: match };
      console.log(`[+${elapsed}s] getFilteredFeed HIT (attempt ${attempt})`);
    }
  }

  if (foundData && foundPost && foundFiltered) break;
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`\n=== summary ===`);
console.log(
  'dataByPath  :',
  foundData
    ? `HIT in ${foundData.elapsed}s`
    : 'MISS (post never landed in data_updates)'
);
console.log(
  'getPosts    :',
  foundPost
    ? `HIT in ${foundPost.elapsed}s`
    : 'MISS (postsCurrent did not return new postId)'
);
console.log(
  'getFiltered :',
  foundFiltered
    ? `HIT in ${foundFiltered.elapsed}s`
    : 'MISS (channel-filtered feed did not return new postId)'
);

if (foundPost) {
  console.log('\nindexed columns:');
  console.log('  channel  =', JSON.stringify(foundPost.row.channel));
  console.log('  kind     =', JSON.stringify(foundPost.row.kind));
  console.log('  audiences=', JSON.stringify(foundPost.row.audiences));
}

if (!foundData) {
  console.log(
    '\n→ The post never appeared in data_updates. Either the substreams indexer is stalled, or the write went somewhere unexpected.'
  );
  process.exit(1);
}
if (foundData && !foundPost) {
  console.log(
    '\n→ The post landed in data_updates but not in postsCurrent. Look at core_schema_views.sql posts_current view (probably operation != "set" or data_type misderived).'
  );
  process.exit(1);
}
process.exit(0);
