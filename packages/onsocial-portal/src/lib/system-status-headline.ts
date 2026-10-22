export type SystemStatusWord = 'up' | 'degraded' | 'down';

export type SystemHeadline = 'Checking' | 'All Operational' | 'Degraded';

export function systemStatusLabel(
  status: SystemStatusWord | null | undefined
): string {
  if (status === 'up') return 'Up';
  if (status === 'degraded') return 'Degraded';
  if (status === 'down') return 'Down';
  return '—';
}

export interface PortalLiveHealth {
  rpc: { status: SystemStatusWord; ms: number | null };
  indexer: {
    status: SystemStatusWord;
    lagBlocks: number | null;
    height: number | null;
    updateNeeded: boolean;
  };
}

export function indexerLiveLabel(
  status: SystemStatusWord | null | undefined,
  updateNeeded?: boolean
): string {
  if (updateNeeded) return 'Update needed';
  if (status === 'up') return 'At tip';
  if (status === 'degraded') return 'Catching up';
  if (status === 'down') return 'Down';
  return '—';
}

export function rpcLiveLabel(
  status: SystemStatusWord | null | undefined,
  ms: number | null | undefined
): string {
  if (status === 'up' && ms != null) return `${ms}ms`;
  if (status === 'up') return 'Up';
  if (status === 'degraded') return 'Backup';
  if (status === 'down') return 'Down';
  return '—';
}

function liveWord(value: unknown): SystemStatusWord | null {
  if (value === 'up' || value === 'degraded' || value === 'down') return value;
  return null;
}

function nonNegative(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.trunc(value);
}

export function parseLiveHealthPayload(body: unknown): PortalLiveHealth | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as { rpc?: unknown; indexer?: unknown };
  if (!record.rpc || typeof record.rpc !== 'object') return null;
  if (!record.indexer || typeof record.indexer !== 'object') return null;
  const rpcStatus = liveWord((record.rpc as { status?: unknown }).status);
  const indexerStatus = liveWord(
    (record.indexer as { status?: unknown }).status
  );
  if (!rpcStatus || !indexerStatus) return null;
  const ms = (record.rpc as { ms?: unknown }).ms;
  return {
    rpc: {
      status: rpcStatus,
      ms: ms == null ? null : nonNegative(ms),
    },
    indexer: {
      status: indexerStatus,
      lagBlocks: nonNegative(
        (record.indexer as { lagBlocks?: unknown }).lagBlocks
      ),
      height: nonNegative((record.indexer as { height?: unknown }).height),
      updateNeeded:
        (record.indexer as { updateNeeded?: unknown }).updateNeeded === true,
    },
  };
}

export function deriveSystemHeadline(input: {
  servicesLoading: boolean;
  contractsLoading: boolean;
  services: { status: SystemStatusWord | null }[];
  contracts: { status: SystemStatusWord | null }[];
  contractsUnavailable: boolean;
  /** Omit until the public live check exists. An empty list is not operational. */
  liveLoading?: boolean;
  live?: { status: SystemStatusWord | null }[] | null;
}): SystemHeadline {
  if (input.servicesLoading || input.contractsLoading || input.liveLoading) {
    return 'Checking';
  }
  if (input.contractsUnavailable && input.contracts.length === 0) {
    return 'Degraded';
  }
  const servicesUp =
    input.services.length > 0 &&
    input.services.every((service) => service.status === 'up');
  const contractsUp =
    input.contracts.length > 0 &&
    input.contracts.every((contract) => contract.status === 'up');
  const liveUp =
    input.live == null ||
    (input.live.length > 0 && input.live.every((row) => row.status === 'up'));
  return servicesUp && contractsUp && liveUp ? 'All Operational' : 'Degraded';
}
