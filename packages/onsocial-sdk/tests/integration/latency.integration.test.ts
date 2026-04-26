// ---------------------------------------------------------------------------
// Latency benchmark: write → substreams read (via OnAPI)
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, ACCOUNT_ID, testId } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('latency', () => {
  let os: OnSocial;
  beforeAll(async () => {
    os = await getClient();
  });

  it('post: write → substreams read', async () => {
    const postId = testId();

    const t0 = performance.now();
    const res = await os.social.post({ text: `Latency ${postId}` }, postId);
    const writeMs = performance.now() - t0;
    console.log(`POST WRITE:      ${writeMs.toFixed(0)}ms  tx: ${res.txHash}`);

    const t1 = performance.now();
    let found: unknown = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const page = await os.query.feed.recent({
        author: ACCOUNT_ID,
        limit: 10,
      });
      found = page.items.find((p: any) => p.postId === postId);
      if (found) {
        const indexMs = performance.now() - t1;
        console.log(
          `POST INDEX:      ${indexMs.toFixed(0)}ms  (poll #${i + 1})`
        );
        console.log(`POST TOTAL:      ${(writeMs + indexMs).toFixed(0)}ms`);
        break;
      }
    }
    expect(found).toBeTruthy();
  }, 180_000);

  it('profile: write → substreams read', async () => {
    const field = `lat_${Date.now()}`;

    const t0 = performance.now();
    await os.social.setProfile({ [field]: 'latency-val' });
    const writeMs = performance.now() - t0;
    console.log(`PROFILE WRITE:   ${writeMs.toFixed(0)}ms`);

    const t1 = performance.now();
    let found: unknown = null;
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const p = await os.query.profiles.get(ACCOUNT_ID);
      if (p && p[field]) {
        found = p[field];
        const indexMs = performance.now() - t1;
        console.log(
          `PROFILE INDEX:   ${indexMs.toFixed(0)}ms  (poll #${i + 1})`
        );
        console.log(`PROFILE TOTAL:   ${(writeMs + indexMs).toFixed(0)}ms`);
        break;
      }
    }
    expect(found).toBeTruthy();
  }, 180_000);

  it('query speed: substreams vs RPC', async () => {
    const t0 = performance.now();
    await os.query.feed.recent({ author: ACCOUNT_ID, limit: 20 });
    const queryMs = performance.now() - t0;

    const t1 = performance.now();
    await os.query.profiles.get(ACCOUNT_ID);
    const profMs = performance.now() - t1;

    const t2 = performance.now();
    await os.social.getOne('profile/name', ACCOUNT_ID);
    const rpcMs = performance.now() - t2;

    console.log(`QUERY posts:     ${queryMs.toFixed(0)}ms (substreams)`);
    console.log(`QUERY profile:   ${profMs.toFixed(0)}ms (substreams)`);
    console.log(`RPC getOne:      ${rpcMs.toFixed(0)}ms (direct RPC)`);
  }, 15_000);
});
