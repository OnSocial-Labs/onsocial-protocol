#!/usr/bin/env node
/**
 * Backfill scarces_collections_current from historical create events + RPC.
 *
 * Usage:
 *   DATABASE_URL=postgres://... NEAR_RPC_URL=https://... \
 *   SCARCES_CONTRACT=scarces.onsocial.testnet \
 *   node indexers/substreams/scripts/backfill_collections_current.mjs
 *
 * Optional: LIMIT=100 DRY_RUN=1
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const NEAR_RPC_URL =
  process.env.NEAR_RPC_URL?.trim() || 'https://test.rpc.fastnear.com';
const SCARCES_CONTRACT =
  process.env.SCARCES_CONTRACT?.trim() || 'scarces.onsocial.testnet';
const LIMIT = Number.parseInt(process.env.LIMIT || '0', 10) || 0;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function viewCollection(collectionId) {
  const res = await fetch(NEAR_RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'backfill',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: SCARCES_CONTRACT,
        method_name: 'get_collection',
        args_base64: Buffer.from(
          JSON.stringify({ collection_id: collectionId })
        ).toString('base64'),
      },
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(JSON.stringify(json.error));
  }
  const raw = json.result?.result;
  if (!raw) return null;
  const decoded = Buffer.from(raw).toString('utf8');
  if (!decoded || decoded === 'null') return null;
  return JSON.parse(decoded);
}

function yocto(raw) {
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return raw;
  if (raw && typeof raw === 'object' && typeof raw['0'] === 'string') {
    return raw['0'];
  }
  return null;
}

function browseFromTemplate(templateRaw) {
  if (!templateRaw || typeof templateRaw !== 'string') {
    return { title: null, media: null, description: null, kind: null, extra: null };
  }
  try {
    const t = JSON.parse(templateRaw);
    let kind = null;
    let extra = t.extra ?? null;
    if (typeof extra === 'string') {
      try {
        const parsed = JSON.parse(extra);
        kind = typeof parsed?.kind === 'string' ? parsed.kind : null;
      } catch {
        /* keep raw */
      }
    } else if (extra && typeof extra === 'object') {
      kind = typeof extra.kind === 'string' ? extra.kind : null;
      extra = JSON.stringify(extra);
    }
    return {
      title: typeof t.title === 'string' ? t.title : null,
      media: typeof t.media === 'string' ? t.media : null,
      description: typeof t.description === 'string' ? t.description : null,
      kind,
      extra: typeof extra === 'string' ? extra : null,
    };
  } catch {
    return { title: null, media: null, description: null, kind: null, extra: null };
  }
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const idSql = `
      SELECT DISTINCT collection_id
      FROM scarces_events
      WHERE event_type = 'COLLECTION_UPDATE'
        AND operation = 'create'
        AND collection_id IS NOT NULL
        AND btrim(collection_id) <> ''
      ORDER BY collection_id
      ${LIMIT > 0 ? `LIMIT ${LIMIT}` : ''}
    `;
    const { rows } = await client.query(idSql);
    console.log(`Found ${rows.length} collection ids to backfill`);
    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (const { collection_id: collectionId } of rows) {
      try {
        const record = await viewCollection(collectionId);
        if (!record || record.banned) {
          skipped += 1;
          continue;
        }
        const browse = browseFromTemplate(record.metadata_template);
        const total = Number(record.total_supply) || 0;
        const minted = Number(record.minted_count) || 0;
        const remaining = Math.max(0, total - minted);
        const price = yocto(record.price_near);
        const allowlistPrice = yocto(record.allowlist_price);
        const royaltyJson = record.royalty
          ? JSON.stringify(record.royalty)
          : null;
        const kind =
          (typeof browse.kind === 'string' && browse.kind.trim()) || null;
        const mediumKind = kind
          ? kind.toLowerCase() === 'music'
            ? 'audio'
            : kind.toLowerCase()
          : null;
        const values = [
          collectionId,
          record.creator_id || 'unknown',
          record.app_id ?? null,
          price,
          allowlistPrice,
          total,
          minted,
          remaining,
          record.start_time ?? null,
          record.end_time ?? null,
          record.created_at ?? null,
          record.mint_mode ?? 'open',
          record.max_per_wallet ?? null,
          Boolean(record.paused),
          Boolean(record.cancelled),
          Boolean(record.banned),
          record.transferable !== false,
          Boolean(record.renewable),
          record.max_redeems ?? null,
          Boolean(record.random_assignment),
          record.app_commission_bps ?? null,
          browse.title,
          browse.media,
          browse.description,
          kind,
          mediumKind,
          record.metadata_template ?? null,
          record.metadata ?? null,
          browse.extra,
          royaltyJson,
        ];

        if (DRY_RUN) {
          console.log('[dry-run]', collectionId, browse.title || '(no title)');
          ok += 1;
          continue;
        }

        await client.query(
          `
          INSERT INTO scarces_collections_current (
            collection_id, creator_id, app_id, price, allowlist_price,
            total_supply, minted_count, remaining, start_time, end_time,
            created_at, mint_mode, max_per_wallet, paused, cancelled, banned,
            transferable, renewable, max_redeems, random_assignment,
            app_commission_bps, title, media, description, kind, medium_kind,
            metadata_template, metadata, extra_json, royalty_json,
            created_block_height, created_block_timestamp,
            updated_block_height, updated_block_timestamp
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
            $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            0, COALESCE($11::bigint, 0::bigint), 0, COALESCE($11::bigint, 0::bigint)
          )
          ON CONFLICT (collection_id) DO UPDATE SET
            creator_id = EXCLUDED.creator_id,
            app_id = EXCLUDED.app_id,
            price = EXCLUDED.price,
            allowlist_price = EXCLUDED.allowlist_price,
            total_supply = EXCLUDED.total_supply,
            minted_count = EXCLUDED.minted_count,
            remaining = EXCLUDED.remaining,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            created_at = EXCLUDED.created_at,
            mint_mode = EXCLUDED.mint_mode,
            max_per_wallet = EXCLUDED.max_per_wallet,
            paused = EXCLUDED.paused,
            cancelled = EXCLUDED.cancelled,
            banned = EXCLUDED.banned,
            transferable = EXCLUDED.transferable,
            renewable = EXCLUDED.renewable,
            max_redeems = EXCLUDED.max_redeems,
            random_assignment = EXCLUDED.random_assignment,
            app_commission_bps = EXCLUDED.app_commission_bps,
            title = EXCLUDED.title,
            media = EXCLUDED.media,
            description = EXCLUDED.description,
            kind = EXCLUDED.kind,
            medium_kind = COALESCE(EXCLUDED.medium_kind, scarces_collections_current.medium_kind),
            metadata_template = EXCLUDED.metadata_template,
            metadata = EXCLUDED.metadata,
            extra_json = EXCLUDED.extra_json,
            royalty_json = EXCLUDED.royalty_json,
            updated_block_timestamp = EXCLUDED.updated_block_timestamp
          `,
          values
        );
        ok += 1;
        if (ok % 25 === 0) console.log(`… ${ok} upserted`);
      } catch (err) {
        failed += 1;
        console.error(`fail ${collectionId}:`, err?.message || err);
      }
    }

    console.log(
      JSON.stringify({ ok, skipped, failed, dryRun: DRY_RUN }, null, 2)
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
