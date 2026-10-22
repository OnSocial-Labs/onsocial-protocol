/** A few blocks of pipeline still counts as caught up. */
export const INDEXER_AT_TIP_LAG = 30;

export type LiveWord = 'up' | 'degraded' | 'down';

export interface LiveHealthSnapshot {
  rpc: { status: LiveWord; ms: number | null };
  indexer: {
    status: LiveWord;
    lagBlocks: number | null;
    height: number | null;
    /** Our node speaks an older protocol than the chain. */
    updateNeeded: boolean;
  };
}

export function parseBlockNum(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

/** Hasura `run_sql` tuples: header row, then the cursor row. */
export function parseHasuraCursorBlock(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const result = (body as { result?: unknown }).result;
  if (!Array.isArray(result) || result.length < 2) return null;
  const row = result[1];
  if (!Array.isArray(row)) return null;
  return parseBlockNum(row[0]);
}

export function parseStatusHead(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const height = (result as { sync_info?: { latest_block_height?: unknown } })
    .sync_info?.latest_block_height;
  return parseBlockNum(height);
}

export function parseStatusProtocol(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  return parseBlockNum(
    (result as { protocol_version?: unknown }).protocol_version
  );
}

/** True only when our node and the public chain both answered, and ours is older. */
export function deriveProtocolUpdateNeeded(input: {
  nodeProtocol: number | null;
  chainProtocol: number | null;
}): boolean {
  return (
    input.nodeProtocol != null &&
    input.chainProtocol != null &&
    input.nodeProtocol < input.chainProtocol
  );
}

export function deriveRpcLiveStatus(
  answered: boolean,
  primary: boolean
): LiveWord {
  if (!answered) return 'down';
  return primary ? 'up' : 'degraded';
}

/**
 * `up` is at tip. `degraded` is behind the chain. `down` means the cursor
 * or the chain head could not be read, so the lag is unknown.
 */
export function deriveIndexerLiveStatus(input: {
  cursor: number | null;
  head: number | null;
  updateNeeded?: boolean;
}): {
  status: LiveWord;
  lagBlocks: number | null;
  height: number | null;
  updateNeeded: boolean;
} {
  const updateNeeded = input.updateNeeded === true;
  if (input.cursor == null || input.head == null) {
    return {
      status: updateNeeded ? 'degraded' : 'down',
      lagBlocks: null,
      height: input.cursor,
      updateNeeded,
    };
  }
  const lag = input.head - input.cursor;
  if (updateNeeded) {
    return {
      status: 'degraded',
      lagBlocks: Math.max(0, lag),
      height: input.cursor,
      updateNeeded: true,
    };
  }
  if (lag <= INDEXER_AT_TIP_LAG) {
    return {
      status: 'up',
      lagBlocks: Math.max(0, lag),
      height: input.cursor,
      updateNeeded: false,
    };
  }
  return {
    status: 'degraded',
    lagBlocks: lag,
    height: input.cursor,
    updateNeeded: false,
  };
}
