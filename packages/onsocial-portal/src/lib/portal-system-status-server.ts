import { viewAccount, viewContractAtOnNetwork } from '@/lib/near-rpc';
import {
  isUnreleasedMainnetContract,
  portalNetworkProfile,
  type PortalNearNetwork,
} from '@/lib/portal-network';
import {
  parseLiveHealthPayload,
  type PortalLiveHealth,
} from '@/lib/system-status-headline';

export type PortalContractStatus = 'up' | 'degraded' | 'down' | 'not-live';

export interface PortalContractHealth {
  name: string;
  accountId: string;
  status: PortalContractStatus;
  responseTime: number;
}

export interface PortalServiceHealth {
  name: string;
  status: 'up' | 'down';
}

export interface PortalSystemStatusPayload {
  network: PortalNearNetwork;
  contracts: PortalContractHealth[];
  services: PortalServiceHealth[];
  live: PortalLiveHealth | null;
  liveSupported: boolean;
}

const GATEWAY_SERVICES = [
  ['Gateway', '/health'],
  ['Graph', '/graph/health'],
  ['Storage', '/storage/health'],
  ['Relay', '/relay/health'],
] as const;

function contractProbes(network: PortalNearNetwork) {
  const { contracts } = portalNetworkProfile(network);
  return [
    { name: 'Core', accountId: contracts.core, method: 'get_version' },
    { name: 'Boost', accountId: contracts.boost, method: 'get_stats' },
    { name: 'Token', accountId: contracts.token, method: 'ft_metadata' },
    {
      name: 'Rewards',
      accountId: contracts.rewards,
      method: 'get_contract_info',
    },
    {
      name: 'Scarces',
      accountId: contracts.scarces,
      method: 'get_contract_info',
    },
    { name: 'Vesting', accountId: contracts.vesting, method: 'get_status' },
  ] as const;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

function notLive(
  network: PortalNearNetwork,
  name: string,
  accountId: string,
  responseTime: number
): PortalContractHealth | null {
  if (!isUnreleasedMainnetContract(network, name)) return null;
  return {
    name,
    accountId,
    status: 'not-live',
    responseTime,
  };
}

export async function loadPortalContractHealth(
  network: PortalNearNetwork
): Promise<PortalContractHealth[]> {
  return Promise.all(
    contractProbes(network).map(async ({ name, accountId, method }) => {
      const start = Date.now();
      try {
        const result = await withTimeout(
          viewContractAtOnNetwork(network, accountId, method, {}),
          8_000
        );
        const elapsed = Math.round(Date.now() - start);
        if (result === null) {
          return (
            notLive(network, name, accountId, elapsed) ?? {
              name,
              accountId,
              status: 'degraded' as const,
              responseTime: elapsed,
            }
          );
        }
        return {
          name,
          accountId,
          status: 'up' as const,
          responseTime: elapsed,
        };
      } catch {
        const elapsed = Math.round(Date.now() - start);
        try {
          await withTimeout(viewAccount(accountId, network), 5_000);
          return {
            name,
            accountId,
            status: 'degraded' as const,
            responseTime: elapsed,
          };
        } catch {
          return (
            notLive(network, name, accountId, elapsed) ?? {
              name,
              accountId,
              status: 'down' as const,
              responseTime: elapsed,
            }
          );
        }
      }
    })
  );
}

async function probeGateway(
  apiUrl: string,
  path: string
): Promise<'up' | 'down'> {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

export async function loadPortalGatewayServices(
  network: PortalNearNetwork
): Promise<PortalServiceHealth[]> {
  const { apiUrl } = portalNetworkProfile(network);
  return Promise.all(
    GATEWAY_SERVICES.map(async ([name, path]) => ({
      name,
      status: await probeGateway(apiUrl, path),
    }))
  );
}

export async function loadPortalLiveHealth(
  network: PortalNearNetwork
): Promise<{
  live: PortalLiveHealth | null;
  liveSupported: boolean;
}> {
  const { apiUrl } = portalNetworkProfile(network);
  try {
    const response = await fetch(`${apiUrl}/health/live`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) {
      return { live: null, liveSupported: false };
    }
    const parsed = parseLiveHealthPayload(
      await response.json().catch(() => null)
    );
    if (!response.ok || !parsed) {
      return {
        liveSupported: true,
        live: {
          rpc: { status: 'down', ms: null },
          indexer: {
            status: 'down',
            lagBlocks: null,
            height: null,
            updateNeeded: false,
          },
        },
      };
    }
    return { live: parsed, liveSupported: true };
  } catch {
    return {
      liveSupported: true,
      live: {
        rpc: { status: 'down', ms: null },
        indexer: {
          status: 'down',
          lagBlocks: null,
          height: null,
          updateNeeded: false,
        },
      },
    };
  }
}

export async function loadPortalSystemStatus(
  network: PortalNearNetwork
): Promise<PortalSystemStatusPayload> {
  const [contracts, services, liveHealth] = await Promise.all([
    loadPortalContractHealth(network),
    loadPortalGatewayServices(network),
    loadPortalLiveHealth(network),
  ]);
  return {
    network,
    contracts,
    services,
    live: liveHealth.live,
    liveSupported: liveHealth.liveSupported,
  };
}
