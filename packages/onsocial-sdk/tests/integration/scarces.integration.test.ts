// ---------------------------------------------------------------------------
// Integration: Scarces — mint, list, delist, collection lifecycle, apps
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeAll } from 'vitest';
import { getClient, ACCOUNT_ID, testId } from './helpers.js';
import type { OnSocial } from '../../src/client.js';

describe('scarces', () => {
  let os: OnSocial;
  let tokenTxHash: string;

  beforeAll(async () => {
    os = await getClient();
  });

  it('should mint a scarce (text-only)', async () => {
    const result = await os.scarces.tokens.mint({
      title: `Integration Test Scarce ${Date.now()}`,
      description: 'Automated integration test — safe to ignore',
    });
    tokenTxHash = result.txHash!;
    expect(tokenTxHash).toBeTruthy();
  });

  it('should mint a scarce with royalty', async () => {
    const result = await os.scarces.tokens.mint({
      title: `Royalty Scarce ${Date.now()}`,
      description: 'Test royalty mint',
      royalty: { [ACCOUNT_ID]: 1000 }, // 10%
    });
    expect(result.txHash).toBeTruthy();
  });
});

describe('scarces.collections — lifecycle', () => {
  let os: OnSocial;
  const collectionId = `int_${testId()}`;

  beforeAll(async () => {
    os = await getClient();
  });

  it('creates a small empty collection', async () => {
    const result = await os.scarces.collections.create({
      collectionId,
      totalSupply: 3,
      title: `Integration Collection ${collectionId}`,
      priceNear: '0.1',
      description: 'Automated lifecycle test — safe to ignore',
    });
    expect(result.txHash).toBeTruthy();
  });

  it('updates the price', async () => {
    const r = await os.scarces.collections.updatePrice(collectionId, '0.2');
    expect(r.txHash).toBeTruthy();
  });

  it('updates the timing window', async () => {
    const now = Date.now() * 1_000_000; // ms → ns
    const r = await os.scarces.collections.updateTiming(collectionId, {
      startTime: now,
      endTime: now + 7 * 24 * 60 * 60 * 1_000_000_000,
    });
    expect(r.txHash).toBeTruthy();
  });

  it('pauses then resumes minting', async () => {
    const p = await os.scarces.collections.pause(collectionId);
    expect(p.txHash).toBeTruthy();
    const r = await os.scarces.collections.resume(collectionId);
    expect(r.txHash).toBeTruthy();
  });

  it('deletes the (still-empty) collection', async () => {
    const r = await os.scarces.collections.delete(collectionId);
    expect(r.txHash).toBeTruthy();
  });
});

describe('scarces.apps — registration & moderation', () => {
  let os: OnSocial;
  // Contract requires the registered app_id to be the caller's account or a
  // sub-account of it (see scarces-onsocial app_pool/manage.rs::register_app).
  // A flat unique id like `intapp_${testId()}` panics with Unauthorized,
  // which the relayer reports as a successful tx hash — and then every later
  // method in this describe panics with "App pool not found" because nothing
  // was actually written. Scope the id under ACCOUNT_ID to satisfy ownership.
  const appId = `intapp${testId()}.${ACCOUNT_ID}`;
  const moderatorId =
    process.env.SECONDARY_ACCOUNT_ID ?? 'test02.onsocial.testnet';

  beforeAll(async () => {
    os = await getClient();
  });

  it('registers a new app', async () => {
    const r = await os.scarces.apps.register(appId, {
      curated: false,
      primarySaleBps: 250,
    });
    expect(r.txHash).toBeTruthy();
  });

  it('updates the app config', async () => {
    const r = await os.scarces.apps.setConfig(appId, {
      metadata: '{"v":1,"name":"integration-test"}',
    });
    expect(r.txHash).toBeTruthy();
  });

  it('adds and removes a moderator', async () => {
    const add = await os.scarces.apps.addModerator(appId, moderatorId);
    expect(add.txHash).toBeTruthy();
    const remove = await os.scarces.apps.removeModerator(appId, moderatorId);
    expect(remove.txHash).toBeTruthy();
  });
});

describe('scarces.query — indexed event reads', () => {
  let os: OnSocial;

  beforeAll(async () => {
    os = await getClient();
  });

  it('recentMints returns mint-shaped rows', async () => {
    const rows = await os.query.scarces.recentMints({ limit: 5 });
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.eventType).toBe('SCARCE_UPDATE');
      expect(['quick_mint', 'mint', 'mint_from_collection']).toContain(
        row.operation
      );
    }
  });

  it('mintsBy filters to a single author', async () => {
    const rows = await os.query.scarces.mintsBy(ACCOUNT_ID, { limit: 5 });
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows) {
      expect(row.author).toBe(ACCOUNT_ID);
    }
  });

  it('events with empty filter returns recent rows', async () => {
    const rows = await os.query.scarces.events({ limit: 3 });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(3);
  });
});
