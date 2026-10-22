import {
  createConfiguredNearRpc,
  rpcEndpointLabel,
  type NearRpc,
  type Network,
} from '@onsocial/rpc';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  deriveIndexerLiveStatus,
  deriveRpcLiveStatus,
  parseHasuraCursorBlock,
  parseStatusHead,
  type LiveHealthSnapshot,
} from './live-health.js';

const CACHE_MS = 10_000;
const INDEXER_CURSOR_SQL = "SELECT block_num FROM cursors WHERE id = 'indexer'";

let healthRpc: NearRpc | null = null;
let cached: { at: number; value: LiveHealthSnapshot } | null = null;
let pending: Promise<LiveHealthSnapshot> | null = null;

function getHealthRpc(): NearRpc {
  if (!healthRpc) {
    // Separate from the traffic client so this probe cannot open its circuit.
    healthRpc = createConfiguredNearRpc({
      network: (config.nearNetwork as Network) || 'testnet',
      lavaApiKey: config.lavaApiKey,
      fastnearApiKey: config.fastnearApiKey,
      primaryUrl: config.nearRpcUrl,
      publicOnly: false,
      timeoutMs: 2_000,
      maxRetries: 0,
      onLog: (level, msg, meta) => {
        logger[level]({ ...meta, component: 'live-health' }, msg);
      },
    });
  }
  return healthRpc;
}

async function probeRpc(): Promise<{
  status: LiveHealthSnapshot['rpc']['status'];
  ms: number | null;
  head: number | null;
}> {
  const started = Date.now();
  try {
    const rpc = getHealthRpc();
    const response = await rpc.call('status', []);
    const head = parseStatusHead(response.result);
    const answered = !response.error && head != null;
    const primary =
      rpcEndpointLabel(rpc.getActiveUrl()) ===
      rpcEndpointLabel(config.nearRpcUrl);
    const status = deriveRpcLiveStatus(answered, primary);
    return {
      status,
      ms: status === 'up' ? Math.max(0, Date.now() - started) : null,
      head,
    };
  } catch {
    logger.warn({ component: 'live-health' }, 'RPC live check failed');
    return { status: 'down', ms: null, head: null };
  }
}

async function readIndexerCursor(): Promise<number | null> {
  if (!config.hasuraAdminSecret) return null;
  const url = config.hasuraUrl.replace('/v1/graphql', '/v2/query');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': config.hasuraAdminSecret,
      },
      signal: AbortSignal.timeout(3_000),
      body: JSON.stringify({
        type: 'run_sql',
        args: {
          source: 'default',
          sql: INDEXER_CURSOR_SQL,
          read_only: true,
        },
      }),
    });
    if (!response.ok) return null;
    return parseHasuraCursorBlock(await response.json());
  } catch {
    logger.warn({ component: 'live-health' }, 'Indexer cursor check failed');
    return null;
  }
}

async function probeLiveHealth(): Promise<LiveHealthSnapshot> {
  const [rpc, cursor] = await Promise.all([probeRpc(), readIndexerCursor()]);
  const indexer = deriveIndexerLiveStatus({ cursor, head: rpc.head });
  return {
    rpc: { status: rpc.status, ms: rpc.ms },
    indexer,
  };
}

/** Cached for a few seconds so open homepages share one node and cursor read. */
export function loadLiveHealth(): Promise<LiveHealthSnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS)
    return Promise.resolve(cached.value);
  if (pending) return pending;
  pending = probeLiveHealth()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
