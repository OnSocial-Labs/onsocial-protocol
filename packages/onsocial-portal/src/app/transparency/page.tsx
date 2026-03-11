'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Lock, Key, Gift, Layers, ExternalLink } from 'lucide-react';
import { PageShell } from '@/components/layout/page-shell';

// ─── Tokenomics Distribution ──────────────────────────────────
const TOKEN_DISTRIBUTION = [
  {
    label: 'Dapp Rewards',
    pct: 40,
    tokens: '400M',
    color: '#C084FC',
    note: 'rewards.onsocial.near',
  },
  {
    label: 'Treasury (DAO)',
    pct: 20,
    tokens: '200M',
    color: '#60A5FA',
    note: 'onsocial.sputnik-dao.near',
  },
  {
    label: 'Staking Rewards',
    pct: 15,
    tokens: '150M',
    color: '#4ADE80',
    note: 'staking.onsocial.near',
  },
  {
    label: 'Founder',
    pct: 15,
    tokens: '150M',
    color: '#FBBF24',
    note: 'vesting.onsocial.near · 4yr vest',
  },
  {
    label: 'Liquidity',
    pct: 5,
    tokens: '50M',
    color: '#EC4899',
    note: 'Ref Finance · NEAR + USDC pools',
  },
  {
    label: 'Development',
    pct: 5,
    tokens: '50M',
    color: '#6B7280',
    note: 'dev.onsocial.near',
  },
];

const TOKEN_UTILITY = [
  {
    icon: Lock,
    label: 'Stake for rewards',
    desc: 'Lock tokens, earn pro-rata staking rewards at 0.2%/week',
  },
  {
    icon: Key,
    label: 'Buy API credits',
    desc: '60% funds infrastructure, 40% flows back to staking rewards',
  },
  {
    icon: Gift,
    label: 'Earn from dapps',
    desc: 'Dapps reward users with $SOCIAL for engagement',
  },
  {
    icon: Layers,
    label: 'Governance',
    desc: 'Staked tokens provide voting power for protocol decisions',
  },
];

export default function TransparencyPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <PageShell>
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-[-0.03em]">
            Transparency
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            1 billion $SOCIAL tokens. Fixed supply. No inflation. Every
            allocation is on-chain and verifiable.
          </p>
        </motion.div>

        {/* Tokenomics */}
        <section ref={ref} className="mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.03em] mb-4">
              Token Distribution
            </h2>
          </motion.div>

          {/* Bar visualization */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="max-w-3xl mx-auto mb-12"
          >
            <div className="flex rounded-full overflow-hidden h-4 mb-8 gap-[1px] bg-border/30">
              {TOKEN_DISTRIBUTION.map((d) => (
                <div
                  key={d.label}
                  style={{
                    width: `${d.pct}%`,
                    backgroundColor: d.color,
                    minWidth: '8px',
                  }}
                  className="transition-all first:rounded-l-full last:rounded-r-full"
                  title={`${d.label}: ${d.pct}%`}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {TOKEN_DISTRIBUTION.map((d) => (
                <div key={d.label} className="flex items-start gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
                    style={{ backgroundColor: d.color }}
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {d.label}
                      <span className="text-muted-foreground font-normal ml-1.5">
                        {d.pct}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d.tokens} · {d.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Token Utility */}
        <section className="mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-center mb-8"
          >
            <h2 className="text-2xl md:text-3xl font-bold tracking-[-0.03em] mb-4">
              $SOCIAL Utility
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto"
          >
            {TOKEN_UTILITY.map((u) => (
              <div
                key={u.label}
                className="border border-border/50 rounded-2xl p-6 bg-muted/30 hover:border-border transition-colors"
              >
                <u.icon className="w-5 h-5 text-muted-foreground mb-3" />
                <h3 className="text-sm font-semibold mb-1">{u.label}</h3>
                <p className="text-xs text-muted-foreground">{u.desc}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* On-Chain Verification */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="border border-border/50 rounded-2xl p-6 bg-muted/30 max-w-3xl mx-auto"
        >
          <h3 className="text-base font-semibold mb-4">Verify On-Chain</h3>
          <div className="space-y-3">
            {TOKEN_DISTRIBUTION.map((d) => {
              // Only show .near accounts as verifiable links
              const account = d.note.split(' · ')[0];
              const isOnChain = account.endsWith('.near');
              return (
                <div
                  key={d.label}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="text-muted-foreground">{d.label}</span>
                  </div>
                  {isOnChain ? (
                    <a
                      href={`https://nearblocks.io/address/${account}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-[#60A5FA] hover:underline inline-flex items-center gap-1"
                    >
                      {account}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {d.note}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
    </PageShell>
  );
}
