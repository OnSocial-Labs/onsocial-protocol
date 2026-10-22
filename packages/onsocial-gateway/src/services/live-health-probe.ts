import {
  createConfiguredNearRpc,
  FALLBACK_RPC_URLS,
  rpcEndpointLabel,
  type NearRpc,
  type Network,
} from '@onsocial/rpc';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import {
  deriveIndexerLiveStatus,
  deriveProtocolUpdateNeeded,
  deriveRpcLiveStatus,
  parseHasuraCursorBlock,
  parseStatusHead,
  parseStatusProtocol,
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

async function readStatus(
  url: string
): Promise<{ head: number | null; protocol: number | null } | null> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2_000),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'live-health',
        method: 'status',
        params: [],
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { result?: unknown };
    return {
      head: parseStatusHead(body.result),
      protocol: parseStatusProtocol(body.result),
    };
  } catch {
    return null;
  }
}

async function probeRpc(): Promise<{
  status: LiveHealthSnapshot['rpc']['status'];
  ms: number | null;
  head: number | null;
  protocol: number | null;
}> {
  const started = Date.now();
  try {
    const rpc = getHealthRpc();
    const response = await rpc.call('status', []);
    const head = parseStatusHead(response.result);
    const protocol = parseStatusProtocol(response.result);
    const answered = !response.error && head != null;
    const primary =
      rpcEndpointLabel(rpc.getActiveUrl()) ===
      rpcEndpointLabel(config.nearRpcUrl);
    const status = deriveRpcLiveStatus(answered, primary);
    return {
      status,
      ms: status === 'up' ? Math.max(0, Date.now() - started) : null,
      head,
      protocol: status === 'up' ? protocol : null,
    };
  } catch {
    logger.warn({ component: 'live-health' }, 'RPC live check failed');
    return { status: 'down', ms: null, head: null, protocol: null };
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
  const network = (config.nearNetwork as Network) || 'testnet';
  const chainUrl = FALLBACK_RPC_URLS[network];
  const nodeIsDistinct =
    rpcEndpointLabel(config.nearRpcUrl) !== rpcEndpointLabel(chainUrl);
  const [rpc, cursor, chain] = await Promise.all([
    probeRpc(),
    readIndexerCursor(),
    readStatus(chainUrl),
  ]);
  let nodeProtocol = nodeIsDistinct ? rpc.protocol : null;
  if (nodeIsDistinct && nodeProtocol == null) {
    const node = await readStatus(config.nearRpcUrl);
    nodeProtocol = node?.protocol ?? null;
  }
  const chainProtocol = chain?.protocol ?? null;
  const head = chain?.head ?? rpc.head;
  const indexer = deriveIndexerLiveStatus({
    cursor,
    head,
    updateNeeded: deriveProtocolUpdateNeeded({ nodeProtocol, chainProtocol }),
  });
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
