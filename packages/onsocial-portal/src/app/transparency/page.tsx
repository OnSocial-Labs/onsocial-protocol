'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Copy,
  Database,
  ExternalLink,
  Gift,
  Key,
  Layers,
  Lock,
  PieChart,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  TOKEN_CONTRACT,
  viewContractAtOnNetwork,
  yoctoToSocial,
} from '@/lib/near-rpc';
import {
  ACTIVE_API_URL,
  ACTIVE_NEAR_EXPLORER_URL,
  ACTIVE_NEAR_NETWORK,
  NEAR_ACCOUNT_SUFFIX,
} from '@/lib/portal-config';
import {
  portalColors,
  portalFrameStyle,
  type PortalAccent,
} from '@/lib/portal-colors';

const NETWORK = ACTIVE_NEAR_NETWORK;
const API_URL = ACTIVE_API_URL;
const NEARBLOCKS_BASE_URL = ACTIVE_NEAR_EXPLORER_URL;
const TOKEN_NEARBLOCKS_URL = `${NEARBLOCKS_BASE_URL}/token/${TOKEN_CONTRACT}`;
const TOKEN_HOLDERS_URL = `${TOKEN_NEARBLOCKS_URL}?tab=holders`;
const INITIAL_SUPPLY_TOKENS = 1_000_000_000n;
const TOKEN_DECIMALS = 18n;
const INITIAL_SUPPLY_YOCTO = INITIAL_SUPPLY_TOKENS * 10n ** TOKEN_DECIMALS;

function allocationAccount(name: string): string {
  return `${name}.${NEAR_ACCOUNT_SUFFIX}`;
}

// ─── Tokenomics Distribution ──────────────────────────────────
const TOKEN_DISTRIBUTION = [
  {
    label: 'Ecosystem & Partner Rewards',
    pct: 40,
    tokens: '400M',
    accent: 'purple' as PortalAccent,
    note: allocationAccount('rewards'),
  },
  {
    label: 'Treasury & Operations',
    pct: 10,
    tokens: '100M',
    accent: 'blue' as PortalAccent,
    note: allocationAccount('treasury'),
  },
  {
    label: 'Staking Rewards',
    pct: 15,
    tokens: '150M',
    accent: 'green' as PortalAccent,
    note: allocationAccount('staking'),
  },
  {
    label: 'Founder Vesting',
    pct: 12.5,
    tokens: '125M',
    accent: 'amber' as PortalAccent,
    note: `${allocationAccount('founder-vesting')} · 4y vest · 1y cliff`,
  },
  {
    label: 'Future Team & Contributors',
    pct: 12.5,
    tokens: '125M',
    accent: 'red' as PortalAccent,
    note: `${allocationAccount('treasury')} · per-grant vesting as approved`,
  },
  {
    label: 'Liquidity Reserve',
    pct: 5,
    tokens: '50M',
    accent: 'pink' as PortalAccent,
    note: `${allocationAccount('treasury')} · 200K deployed, rest staged`,
  },
  {
    label: 'Development & Strategic Growth',
    pct: 5,
    tokens: '50M',
    accent: 'slate' as PortalAccent,
    note: `${allocationAccount('treasury')} · staged ops and partnerships`,
  },
];

const TOKEN_UTILITY = [
  {
    icon: Lock,
    label: 'Stake for rewards',
    desc: 'Lock SOCIAL for staking rewards.',
    accent: 'green' as PortalAccent,
    href: '/staking',
    ctaLabel: 'Open staking',
  },
  {
    icon: Key,
    label: 'Build with OnApi',
    desc: 'Use SOCIAL to access OnApi infrastructure.',
    accent: 'blue' as PortalAccent,
    href: '/onapi',
    ctaLabel: 'Open OnApi',
  },
  {
    icon: Gift,
    label: 'Earn with OnSocial & partners',
    desc: 'Earn SOCIAL through OnSocial and partner apps.',
    accent: 'purple' as PortalAccent,
    href: '/partners',
    ctaLabel: 'Open partner setup',
  },
  {
    icon: PieChart,
    label: 'Governance',
    desc: 'Staked SOCIAL can carry governance weight over time.',
    accent: 'slate' as PortalAccent,
    ctaLabel: 'Expanding scope',
  },
];

const TRUST_PRINCIPLES = [
  {
    icon: Database,
    title: 'On-Chain Custody',
    desc: 'Major allocations are mapped to named NEAR accounts and published reserve plans, verifiable on-chain.',
    accent: 'blue' as PortalAccent,
  },
  {
    icon: Shield,
    title: 'No Hidden Minting',
    desc: 'Fixed 1B supply. Burnable, with no public mint path for additional issuance.',
    accent: 'green' as PortalAccent,
  },
  {
    icon: TrendingUp,
    title: 'Vesting & Time-Locks',
    desc: 'Founder tokens use a 4-year vest with a 1-year cliff. Team allocations are treasury-held for approved vesting schedules.',
    accent: 'purple' as PortalAccent,
  },
];

interface TokenMetadataView {
  icon?: string | null;
  symbol?: string;
}

function formatWholeTokenAmount(raw: string): string {
  const human = yoctoToSocial(raw);
  const whole = BigInt(human.split('.')[0] || '0');
  return whole.toLocaleString('en-US');
}

function getDistributionLink(note: string): string | null {
  const account = note.split(' · ')[0];
  return account.endsWith('.near') || account.endsWith('.testnet')
    ? `${NEARBLOCKS_BASE_URL}/address/${account}`
    : null;
}

export default function TransparencyPage() {
  const ref = useRef(null);
  const distributionInteractionRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });
  const [hoveredDistributionIndex, setHoveredDistributionIndex] = useState<
    number | null
  >(null);
  const [selectedDistributionIndex, setSelectedDistributionIndex] = useState<
    number | null
  >(null);
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState('SOCIAL');
  const [copiedTokenContract, setCopiedTokenContract] = useState(false);
  const [holderCount, setHolderCount] = useState<number | null>(null);
  const [holderCountLoaded, setHolderCountLoaded] = useState(false);
  const [currentSupplyDisplay, setCurrentSupplyDisplay] = useState<
    string | null
  >(null);
  const [burnedDisplay, setBurnedDisplay] = useState<string | null>(null);
  const [supplyLoaded, setSupplyLoaded] = useState(false);

  const activeDistributionIndex =
    selectedDistributionIndex ?? hoveredDistributionIndex;
  const activeDistribution =
    activeDistributionIndex !== null
      ? TOKEN_DISTRIBUTION[activeDistributionIndex]
      : null;

  useEffect(() => {
    viewContractAtOnNetwork<TokenMetadataView>(
      NETWORK,
      TOKEN_CONTRACT,
      'ft_metadata',
      {}
    )
      .then((metadata) => {
        if (metadata?.icon) {
          setTokenIconSrc(metadata.icon);
        }
        if (metadata?.symbol) {
          setTokenSymbol(metadata.symbol);
        }
      })
      .catch(() => {});

    viewContractAtOnNetwork<string>(
      NETWORK,
      TOKEN_CONTRACT,
      'ft_total_supply',
      {}
    )
      .then((totalSupply) => {
        if (totalSupply) {
          const currentSupplyYocto = BigInt(totalSupply);
          const burnedYocto =
            currentSupplyYocto <= INITIAL_SUPPLY_YOCTO
              ? INITIAL_SUPPLY_YOCTO - currentSupplyYocto
              : 0n;

          setCurrentSupplyDisplay(formatWholeTokenAmount(totalSupply));
          setBurnedDisplay(formatWholeTokenAmount(burnedYocto.toString()));
        }
      })
      .catch(() => {})
      .finally(() => setSupplyLoaded(true));

    fetch(`${API_URL}/graph/token-stats`, {
      signal: AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as { holders?: number };
      })
      .then((data) => {
        if (typeof data?.holders === 'number') {
          setHolderCount(data.holders);
        }
      })
      .catch(() => {})
      .finally(() => setHolderCountLoaded(true));
  }, []);

  useEffect(() => {
    if (selectedDistributionIndex === null) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideBar =
        distributionInteractionRef.current?.contains(target) ?? false;

      if (!insideBar) {
        setSelectedDistributionIndex(null);
        setHoveredDistributionIndex(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [selectedDistributionIndex]);

  const handleCopyTokenContract = async () => {
    await navigator.clipboard.writeText(TOKEN_CONTRACT);
    setCopiedTokenContract(true);
    setTimeout(() => setCopiedTokenContract(false), 2000);
  };

  function renderStatValue(value: string | null, loaded: boolean) {
    if (!loaded) {
      return <PulsingDots size="sm" className="text-muted-foreground" />;
    }

    if (!value) {
      return <span aria-label="Unavailable">--</span>;
    }

    return value;
  }

  return (
    <PageShell className="max-w-5xl">
      {/* ── Hero ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 px-2 py-4 text-center md:py-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, rgba(96,165,250,0.18), transparent 45%), radial-gradient(circle at 75% 25%, rgba(192,132,252,0.12), transparent 38%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl">
          <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
            Fixed supply
            <br />
            <span className="portal-green-text">Visible allocation</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            1 billion initial supply — every major allocation mapped to an
            on-chain account or published reserve plan.
          </p>

          {/* Token Contract Badge */}
          <div className="mt-6 flex justify-center">
            <div className="max-w-full">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/50 bg-background/70 px-3 py-2 text-sm text-muted-foreground backdrop-blur-sm">
                {tokenIconSrc ? (
                  <img
                    src={tokenIconSrc}
                    alt={tokenSymbol}
                    className="h-5 w-5 rounded-full object-cover"
                    onError={() => setTokenIconSrc(null)}
                  />
                ) : (
                  <span className="portal-blue-badge flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-semibold">
                    {tokenSymbol.slice(0, 1)}
                  </span>
                )}
                <span className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/80">
                  {tokenSymbol}
                </span>
                <a
                  href={`${NEARBLOCKS_BASE_URL}/address/${TOKEN_CONTRACT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-xs portal-link"
                >
                  {TOKEN_CONTRACT}
                </a>
                <button
                  onClick={handleCopyTokenContract}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
                  title={
                    copiedTokenContract ? 'Copied!' : 'Copy token contract'
                  }
                  aria-label={
                    copiedTokenContract
                      ? 'Copied token contract'
                      : 'Copy token contract'
                  }
                >
                  {copiedTokenContract ? (
                    <Check className="portal-green-icon h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={`${NEARBLOCKS_BASE_URL}/address/${TOKEN_CONTRACT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/20 text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground"
                  aria-label="Open token contract on Nearblocks"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="mt-3 text-center text-xs uppercase tracking-[0.16em] text-muted-foreground">
                NEP-141 · 18 Decimals · Burnable
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Key Stats ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="mb-8"
      >
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="grid gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Current Supply
            </span>
            <a
              href={TOKEN_NEARBLOCKS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-base font-bold portal-link md:text-lg"
            >
              {renderStatValue(currentSupplyDisplay, supplyLoaded)}
            </a>
          </div>
          <div className="grid gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Burned
            </span>
            <a
              href={TOKEN_NEARBLOCKS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-base font-bold portal-link md:text-lg"
            >
              {renderStatValue(burnedDisplay, supplyLoaded)}
            </a>
          </div>
          <div className="grid gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Unique Holders
            </span>
            <a
              href={TOKEN_HOLDERS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-7 items-center justify-center gap-1 font-mono text-base font-bold portal-link md:text-lg"
            >
              {!holderCountLoaded ? (
                <PulsingDots size="sm" className="text-muted-foreground" />
              ) : holderCount !== null ? (
                holderCount.toLocaleString()
              ) : (
                <span aria-label="Unavailable">--</span>
              )}
            </a>
          </div>
        </div>
      </motion.div>

      {/* ── Distribution Card ── */}
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
        className="mb-8 rounded-[1.75rem] border border-border/50 bg-background/40 p-5 md:p-8"
      >
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/20 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              <PieChart className="h-3.5 w-3.5" />
              Token Distribution
            </div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
              Where the supply is allocated
            </h2>
          </div>
        </div>

        {/* Interactive Distribution Bar */}
        <div className="relative mb-5 pt-10">
          {activeDistribution ? (
            <div className="absolute inset-x-0 top-0 z-10 flex justify-center pointer-events-none">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/95 px-3 py-1.5 shadow-lg shadow-black/10 backdrop-blur-sm">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: portalColors[activeDistribution.accent],
                  }}
                />
                <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/85">
                  {activeDistribution.label}
                </span>
                <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {activeDistribution.tokens} · {activeDistribution.pct}%
                </span>
              </div>
            </div>
          ) : null}

          <div
            ref={distributionInteractionRef}
            className="overflow-hidden rounded-full bg-border/30"
            onMouseLeave={() => {
              if (selectedDistributionIndex === null) {
                setHoveredDistributionIndex(null);
              }
            }}
          >
            <div className="flex h-[18px] items-center gap-px">
              {TOKEN_DISTRIBUTION.map((d, index) => (
                <button
                  key={d.label}
                  type="button"
                  style={{
                    width: `${d.pct}%`,
                    backgroundColor: portalColors[d.accent],
                    minWidth: '8px',
                  }}
                  onMouseEnter={() => {
                    if (selectedDistributionIndex === null) {
                      setHoveredDistributionIndex(index);
                    }
                  }}
                  onFocus={() => {
                    if (selectedDistributionIndex === null) {
                      setHoveredDistributionIndex(index);
                    }
                  }}
                  onClick={() => {
                    setSelectedDistributionIndex((current) =>
                      current === index ? null : index
                    );
                    setHoveredDistributionIndex(index);
                  }}
                  onBlur={() =>
                    setHoveredDistributionIndex((current) => {
                      if (selectedDistributionIndex !== null) {
                        return current;
                      }
                      return current === index ? null : current;
                    })
                  }
                  aria-label={`${d.label}: ${d.tokens}, ${d.pct}% of supply`}
                  aria-pressed={selectedDistributionIndex === index}
                  className={`first:rounded-l-full last:rounded-r-full focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200 ${
                    selectedDistributionIndex === index
                      ? 'h-[18px] shadow-[0_0_0_1px_rgba(255,255,255,0.45)]'
                      : 'h-4'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full border border-border/50 bg-muted/20 px-2.5 py-1 uppercase tracking-[0.14em]">
            Custody First
          </span>
          <span>contracts run live pools</span>
          <span className="hidden text-border/80 md:inline">/</span>
          <span>treasury stages reserves</span>
          <span className="hidden text-border/80 md:inline">/</span>
          <span>vesting locks timed allocations</span>
        </div>

        {/* Distribution Details Grid */}
        <div className="border-t border-border/40 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:gap-x-6 lg:gap-x-8">
          {TOKEN_DISTRIBUTION.map((d, index) => {
            const link = getDistributionLink(d.note);
            const account = d.note.split(' · ')[0];
            const detail = d.note.includes(' · ')
              ? d.note.split(' · ').slice(1).join(' · ')
              : null;

            return (
              <div
                key={d.label}
                className={`border-b border-border/40 py-3 ${
                  index >= TOKEN_DISTRIBUTION.length - 2 ? 'md:border-b-0' : ''
                } ${index === TOKEN_DISTRIBUTION.length - 1 ? 'border-b-0' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: portalColors[d.accent] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {d.label}
                      </p>
                      <span className="font-mono text-xs text-foreground/80">
                        {d.tokens}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {d.pct}%
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 break-all font-mono text-xs portal-link"
                        >
                          {account}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {account}
                        </span>
                      )}
                      {detail ? (
                        <span className="text-xs text-muted-foreground">
                          {detail}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Token Utility ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8 rounded-[1.75rem] border border-border/50 bg-background/40 p-5 md:p-8"
      >
        <div className="mb-5 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Layers className="portal-green-icon h-4 w-4" />
          How SOCIAL Is Used
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {TOKEN_UTILITY.map((u) => {
            const content = (
              <>
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border"
                    style={portalFrameStyle(u.accent)}
                  >
                    <u.icon
                      className="h-4 w-4"
                      style={{ color: portalColors[u.accent] }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 text-sm font-semibold">{u.label}</h3>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {u.desc}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-4 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <span>{u.ctaLabel}</span>
                  {u.href ? (
                    <ArrowRight className="h-3.5 w-3.5 text-foreground/70 transition-transform group-hover:translate-x-0.5" />
                  ) : (
                    <span className="rounded-full border border-border/50 bg-muted/20 px-2 py-1 text-[10px] tracking-[0.14em]">
                      Soon
                    </span>
                  )}
                </div>
              </>
            );

            if (u.href) {
              return (
                <Link
                  key={u.label}
                  href={u.href}
                  className="group flex h-full flex-col justify-between rounded-[1.25rem] border border-border/50 bg-background/30 p-5 transition-all hover:border-border hover:bg-background/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={u.label}
                className="flex h-full flex-col justify-between rounded-[1.25rem] border border-border/50 bg-background/30 p-5"
              >
                {content}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ── Trust Principles ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <div className="grid gap-0 border-y border-border/40 md:grid-cols-3">
          {TRUST_PRINCIPLES.map((p, index) => (
            <div
              key={p.title}
              className={`relative px-0 py-5 ${
                index < TRUST_PRINCIPLES.length - 1
                  ? 'border-b border-border/40 md:border-b-0 md:pr-6'
                  : 'md:pl-6'
              } ${index === 1 ? 'md:px-6' : ''}`}
            >
              <p.icon
                className="mb-3 h-4 w-4"
                style={{ color: portalColors[p.accent] }}
              />
              <h3 className="mb-1 text-sm font-semibold">{p.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {p.desc}
              </p>
              {index < TRUST_PRINCIPLES.length - 1 && (
                <span className="absolute bottom-5 right-0 top-5 hidden w-px bg-border/40 md:block" />
              )}
            </div>
          ))}
        </div>
      </motion.div>
    </PageShell>
  );
}
