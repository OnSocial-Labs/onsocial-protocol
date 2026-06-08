import {
  BOOST_CONTRACT,
  CORE_CONTRACT,
  REWARDS_CONTRACT,
  SCARCES_CONTRACT,
  TOKEN_CONTRACT,
  VESTING_CONTRACT,
  viewAccount,
  viewContractAt,
} from '@/lib/near-rpc';

export interface PortalContractHealth {
  name: string;
  accountId: string;
  status: 'up' | 'degraded' | 'down';
  responseTime: number;
}

export interface PortalSystemStatusPayload {
  contracts: PortalContractHealth[];
}

const CONTRACT_PROBES = [
  {
    name: 'Core',
    accountId: CORE_CONTRACT,
    probe: () =>
      viewContractAt<{ version: string }>(CORE_CONTRACT, 'get_version', {}),
  },
  {
    name: 'Boost',
    accountId: BOOST_CONTRACT,
    probe: () => viewContractAt(BOOST_CONTRACT, 'get_stats', {}),
  },
  {
    name: 'Token',
    accountId: TOKEN_CONTRACT,
    probe: () => viewContractAt(TOKEN_CONTRACT, 'ft_metadata', {}),
  },
  {
    name: 'Rewards',
    accountId: REWARDS_CONTRACT,
    probe: () => viewContractAt(REWARDS_CONTRACT, 'get_contract_info', {}),
  },
  {
    name: 'Scarces',
    accountId: SCARCES_CONTRACT,
    probe: () => viewContractAt(SCARCES_CONTRACT, 'get_contract_info', {}),
  },
  {
    name: 'Vesting',
    accountId: VESTING_CONTRACT,
    probe: () => viewContractAt(VESTING_CONTRACT, 'get_status', {}),
  },
] as const;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

export async function loadPortalContractHealth(): Promise<
  PortalContractHealth[]
> {
  return Promise.all(
    CONTRACT_PROBES.map(async ({ name, accountId, probe }) => {
      const start = Date.now();
      try {
        const result = await withTimeout(probe(), 8_000);
        const elapsed = Math.round(Date.now() - start);
        return {
          name,
          accountId,
          status: (result === null ? 'degraded' : 'up') as 'up' | 'degraded',
          responseTime: elapsed,
        };
      } catch {
        const elapsed = Math.round(Date.now() - start);
        try {
          await withTimeout(viewAccount(accountId), 5_000);
          return {
            name,
            accountId,
            status: 'degraded' as const,
            responseTime: elapsed,
          };
        } catch {
          return {
            name,
            accountId,
            status: 'down' as const,
            responseTime: elapsed,
          };
        }
      }
    })
  );
}

export async function loadPortalSystemStatus(): Promise<PortalSystemStatusPayload> {
  return {
    contracts: await loadPortalContractHealth(),
  };
}
