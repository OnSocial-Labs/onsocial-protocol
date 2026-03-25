'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  Globe,
  Zap,
  CheckCircle2,
  XCircle,
  FileCode2,
} from 'lucide-react';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  CORE_CONTRACT,
  REWARDS_CONTRACT,
  SCARCES_CONTRACT,
  STAKING_CONTRACT,
  TOKEN_CONTRACT,
  VESTING_CONTRACT,
  viewAccount,
  viewContractAt,
} from '@/lib/near-rpc';
import { ACTIVE_API_URL } from '@/lib/portal-config';

interface HealthData {
  gatewayServices: string[] | null;
  gatewayVersion: string | null;
  gateway: { status: 'up' | 'down'; responseTime: number } | null;
  graph: { status: 'up' | 'down'; responseTime: number } | null;
  storage: { status: 'up' | 'down'; responseTime: number } | null;
  relayer: { status: 'up' | 'down'; responseTime: number } | null;
}

type ContractHealthStatus = 'up' | 'degraded' | 'down';

interface ContractHealth {
  name: string;
  accountId: string;
  status: ContractHealthStatus;
  responseTime: number;
  detail: string;
}

const CONTRACT_PROBES = [
  {
    name: 'Core',
    accountId: CORE_CONTRACT,
    probe: () =>
      viewContractAt<{ version: string }>(CORE_CONTRACT, 'get_version', {}),
  },
  {
    name: 'Staking',
    accountId: STAKING_CONTRACT,
    probe: () => viewContractAt(STAKING_CONTRACT, 'get_stats', {}),
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

export function SystemStatus() {
  const [health, setHealth] = useState<HealthData>({
    gatewayServices: null,
    gatewayVersion: null,
    gateway: null,
    graph: null,
    storage: null,
    relayer: null,
  });
  const [loading, setLoading] = useState(true);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [contractsOpen, setContractsOpen] = useState(false);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contracts, setContracts] = useState<ContractHealth[] | null>(null);
  const [contractsCheckedAt, setContractsCheckedAt] = useState<number | null>(
    null
  );

  const checkHealth = useCallback(async () => {
    const apiUrl = ACTIVE_API_URL;

    const results: HealthData = {
      gatewayServices: null,
      gatewayVersion: null,
      gateway: null,
      graph: null,
      storage: null,
      relayer: null,
    };

    // Check gateway
    try {
      const start = performance.now();
      const res = await fetch(`${apiUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const elapsed = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        results.gateway = { status: 'up', responseTime: elapsed };
        results.gatewayVersion = data.version ?? null;
        results.gatewayServices = Array.isArray(data.services)
          ? data.services
          : null;
      } else {
        results.gateway = { status: 'down', responseTime: elapsed };
      }
    } catch {
      results.gateway = { status: 'down', responseTime: 0 };
    }

    // Check graph health
    try {
      const start = performance.now();
      const res = await fetch(`${apiUrl}/graph/health`, {
        signal: AbortSignal.timeout(5000),
      });
      results.graph = {
        status: res.ok ? 'up' : 'down',
        responseTime: Math.round(performance.now() - start),
      };
    } catch {
      results.graph = { status: 'down', responseTime: 0 };
    }

    // Check storage health
    try {
      const start = performance.now();
      const res = await fetch(`${apiUrl}/storage/health`, {
        signal: AbortSignal.timeout(5000),
      });
      results.storage = {
        status: res.ok ? 'up' : 'down',
        responseTime: Math.round(performance.now() - start),
      };
    } catch {
      results.storage = { status: 'down', responseTime: 0 };
    }

    // Check relayer via gateway relay health
    try {
      const start = performance.now();
      const res = await fetch(`${apiUrl}/relay/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const elapsed = Math.round(performance.now() - start);
      results.relayer = {
        status: res.ok ? 'up' : 'down',
        responseTime: elapsed,
      };
    } catch {
      results.relayer = { status: 'down', responseTime: 0 };
    }

    setHealth(results);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching pattern
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const checkContracts = useCallback(
    async (force = false) => {
      const isFresh =
        !force &&
        contracts &&
        contractsCheckedAt &&
        Date.now() - contractsCheckedAt < 60_000;

      if (isFresh) return;

      setContractsLoading(true);

      const results = await Promise.all(
        CONTRACT_PROBES.map(async ({ name, accountId, probe }) => {
          const start = performance.now();

          try {
            await viewAccount(accountId);
          } catch {
            return {
              name,
              accountId,
              status: 'down' as const,
              responseTime: Math.round(performance.now() - start),
              detail: 'Account unavailable',
            };
          }

          try {
            const probeResult = await probe();
            const elapsed = Math.round(performance.now() - start);

            if (probeResult === null) {
              return {
                name,
                accountId,
                status: 'degraded' as const,
                responseTime: elapsed,
                detail: 'Account online · empty probe',
              };
            }

            return {
              name,
              accountId,
              status: 'up' as const,
              responseTime: elapsed,
              detail: 'View OK',
            };
          } catch {
            return {
              name,
              accountId,
              status: 'degraded' as const,
              responseTime: Math.round(performance.now() - start),
              detail: 'Account online · probe failed',
            };
          }
        })
      );

      setContracts(results);
      setContractsCheckedAt(Date.now());
      setContractsLoading(false);
    },
    [contracts, contractsCheckedAt]
  );

  const toggleContractsOpen = useCallback(() => {
    setContractsOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        void checkContracts();
      }
      return nextOpen;
    });
  }, [checkContracts]);

  const services = [
    {
      name: 'Gateway API',
      description: 'Gateway root health',
      icon: Globe,
      status: health.gateway?.status,
      responseTime: health.gateway?.responseTime,
    },
    {
      name: 'Gasless Relayer',
      description: '2-instance HA · GCP KMS signing',
      icon: Zap,
      status: health.relayer?.status,
      responseTime: health.relayer?.responseTime,
    },
    {
      name: 'Contracts',
      description: 'Direct NEAR RPC probes',
      icon: FileCode2,
      status: contracts
        ? contracts.every((contract) => contract.status === 'up')
          ? 'up'
          : 'down'
        : undefined,
      responseTime: undefined,
      summary: contractsLoading
        ? 'Checking'
        : contracts
          ? contracts.every((contract) => contract.status === 'up')
            ? 'All probes passing'
            : 'Some probes degraded'
          : 'Expand below',
    },
  ];

  const overallHealthy =
    !loading &&
    health.gateway?.status === 'up' &&
    health.graph?.status === 'up' &&
    health.storage?.status === 'up' &&
    health.relayer?.status === 'up';

  const headline = loading
    ? 'Checking gateway, relay, storage, and contracts'
    : overallHealthy
      ? 'All systems operational'
      : 'Some services may be degraded';

  const getServiceSummary = (service: (typeof services)[number]) => {
    if (loading) return 'Checking';
    if (service.summary) return service.summary;
    if (service.status !== 'up') return 'Unavailable';
    if (service.responseTime === undefined) return 'Online';
    return `${service.responseTime}ms`;
  };

  const contractsHealthy =
    contracts?.every((contract) => contract.status === 'up') ?? false;

  const contractSummary = contractsLoading
    ? 'Checking contracts'
    : contracts
      ? contractsHealthy
        ? 'All contract probes passing'
        : 'Some contract probes degraded'
      : 'Expand to check contracts';

  const serviceDetails = [
    {
      name: 'Gateway',
      path: '/health',
      status: health.gateway?.status,
      responseTime: health.gateway?.responseTime,
      detail: health.gatewayVersion
        ? `v${health.gatewayVersion}`
        : 'Root health',
    },
    {
      name: 'Graph',
      path: '/graph/health',
      status: health.graph?.status,
      responseTime: health.graph?.responseTime,
      detail: 'Hasura connectivity',
    },
    {
      name: 'Storage',
      path: '/storage/health',
      status: health.storage?.status,
      responseTime: health.storage?.responseTime,
      detail: 'Lighthouse gateway',
    },
    {
      name: 'Relay',
      path: '/relay/health',
      status: health.relayer?.status,
      responseTime: health.relayer?.responseTime,
      detail: 'Meta-tx relay health',
    },
  ];

  const serviceSummary = loading
    ? 'Checking services'
    : serviceDetails.every((service) => service.status === 'up')
      ? 'All gateway services healthy'
      : 'Some gateway services degraded';

  const getContractTone = (status: ContractHealthStatus) => {
    if (status === 'up') return 'portal-green-icon';
    if (status === 'degraded') return 'portal-amber-icon';
    return 'text-destructive';
  };

  const getEndpointTone = (status?: 'up' | 'down') => {
    if (status === 'up') return 'portal-green-icon';
    if (status === 'down') return 'text-destructive';
    return 'text-muted-foreground';
  };

  return (
    <section id="status" className="py-10 relative">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-[1.75rem] border border-border/50 bg-muted/20 px-5 py-5 md:px-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <div className="pt-0.5">
                  {loading ? (
                    <PulsingDots size="sm" className="text-muted-foreground" />
                  ) : overallHealthy ? (
                    <CheckCircle2 className="portal-green-icon w-4 h-4" />
                  ) : (
                    <XCircle className="portal-amber-icon w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">
                    Live infrastructure
                  </p>
                  <p className="text-base md:text-lg font-semibold tracking-[-0.02em]">
                    {headline}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4 lg:min-w-[520px]">
                <div className="grid gap-3 sm:grid-cols-3">
                  {services.map((service) => {
                    const Icon = service.icon;

                    return (
                      <div
                        key={service.name}
                        className="flex items-center gap-3 rounded-2xl border border-border/40 px-3 py-3"
                      >
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {service.name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {getServiceSummary(service)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-2xl border border-border/40 bg-background/40">
                  <button
                    type="button"
                    onClick={() => setServicesOpen((open) => !open)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-background/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Services</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {serviceSummary}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${servicesOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {servicesOpen && (
                    <div className="border-t border-border/40 px-4 py-3">
                      <div className="space-y-2">
                        {serviceDetails.map((service) => (
                          <div
                            key={service.name}
                            className="flex flex-col gap-1 rounded-xl border border-border/30 px-3 py-3 md:flex-row md:items-center md:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {service.name}
                                </span>
                                <span
                                  className={`h-2 w-2 rounded-full ${getEndpointTone(service.status)}`}
                                />
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {service.path}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground md:text-sm">
                              <span>
                                {loading ? 'Checking' : service.detail}
                              </span>
                              <span className="font-mono text-foreground/80">
                                {loading || service.responseTime === undefined
                                  ? '--'
                                  : `${service.responseTime}ms`}
                              </span>
                            </div>
                          </div>
                        ))}

                        {health.gatewayServices &&
                          health.gatewayServices.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                              <span className="uppercase tracking-[0.14em] text-muted-foreground/80">
                                Registered
                              </span>
                              {health.gatewayServices.map((service) => (
                                <span
                                  key={service}
                                  className="rounded-full border border-border/40 px-2.5 py-1"
                                >
                                  {service}
                                </span>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-border/40 bg-background/40">
                  <button
                    type="button"
                    onClick={toggleContractsOpen}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-background/50"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <FileCode2 className="h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Contracts</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {contractSummary}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${contractsOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {contractsOpen && (
                    <div className="border-t border-border/40 px-4 py-3">
                      {contractsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <PulsingDots
                            size="sm"
                            className="text-muted-foreground"
                          />
                          Checking direct NEAR RPC probes
                        </div>
                      ) : contracts ? (
                        <div className="space-y-2">
                          {contracts.map((contract) => (
                            <div
                              key={contract.name}
                              className="flex flex-col gap-1 rounded-xl border border-border/30 px-3 py-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {contract.name}
                                  </span>
                                  <span
                                    className={`h-2 w-2 rounded-full ${getContractTone(contract.status)}`}
                                  />
                                </div>
                                <p className="truncate text-xs text-muted-foreground">
                                  {contract.accountId}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground md:text-sm">
                                <span>{contract.detail}</span>
                                <span className="font-mono text-foreground/80">
                                  {contract.responseTime}ms
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
