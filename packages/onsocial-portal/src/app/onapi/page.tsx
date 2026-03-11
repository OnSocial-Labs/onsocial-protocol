'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Coins,
  Server,
  Zap,
  ArrowRight,
  CheckCircle2,
  Info,
} from 'lucide-react';

// ─── API Credit Tiers ─────────────────────────────────────────
const API_TIERS = [
  {
    name: 'Free',
    price: '$0',
    priceNote: 'forever',
    rateLimit: '60 req/min',
    queryDepth: 3,
    complexity: 50,
    rowLimit: '100',
    aggregations: false,
    color: '#4ADE80',
    available: true,
  },
  {
    name: 'Pro',
    price: '$49',
    priceNote: '/mo in $SOCIAL',
    rateLimit: '600 req/min',
    queryDepth: 8,
    complexity: 1000,
    rowLimit: '10,000',
    aggregations: true,
    color: '#60A5FA',
    available: false,
  },
  {
    name: 'Scale',
    price: '$199',
    priceNote: '/mo in $SOCIAL',
    rateLimit: '3,000 req/min',
    queryDepth: 12,
    complexity: 5000,
    rowLimit: '50,000',
    aggregations: true,
    color: '#C084FC',
    available: false,
  },
];

export default function OnApiPage() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-[-0.03em]">
            OnApi
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Purchase credits with $SOCIAL to unlock higher rate limits and
            advanced query features for your dapp.
          </p>
        </motion.div>

        {/* How Credits Work */}
        <section ref={ref} className="mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto mb-12"
          >
            <div className="border border-border/50 rounded-2xl p-6 bg-muted/30">
              <h3 className="text-base font-semibold mb-4">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-xl border border-[#4ADE80]/30 flex items-center justify-center mb-3">
                    <Coins className="w-5 h-5 text-[#4ADE80]" />
                  </div>
                  <h4 className="text-sm font-semibold mb-1">
                    1. Purchase Credits
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Send $SOCIAL tokens to the staking contract with a credits
                    action
                  </p>
                </div>
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-xl border border-[#60A5FA]/30 flex items-center justify-center mb-3">
                    <Server className="w-5 h-5 text-[#60A5FA]" />
                  </div>
                  <h4 className="text-sm font-semibold mb-1">
                    2. Credits Allocated
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    60% funds infrastructure · 40% flows to staking rewards pool
                  </p>
                </div>
                <div className="flex flex-col items-center text-center">
                  <div className="w-10 h-10 rounded-xl border border-[#C084FC]/30 flex items-center justify-center mb-3">
                    <Zap className="w-5 h-5 text-[#C084FC]" />
                  </div>
                  <h4 className="text-sm font-semibold mb-1">3. Use the API</h4>
                  <p className="text-xs text-muted-foreground">
                    Credits are debited per API call at your tier&apos;s rate
                    limits
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Tier Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl mx-auto mb-8"
        >
          {API_TIERS.map((tier) => (
            <div
              key={tier.name}
              className="relative border border-border/50 rounded-2xl p-6 bg-muted/30 hover:border-border transition-colors flex flex-col"
            >
              {!tier.available && (
                <div className="absolute -top-3 right-4 px-3 py-1 border border-[#C084FC]/40 bg-[#C084FC]/[0.06] text-foreground rounded-full text-xs font-medium">
                  Coming Soon
                </div>
              )}
              <div
                className="w-3 h-3 rounded-full mb-4"
                style={{ backgroundColor: tier.color }}
              />
              <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
              <div className="mb-4">
                <span className="text-2xl font-bold">{tier.price}</span>
                <span className="text-sm text-muted-foreground ml-1">
                  {tier.priceNote}
                </span>
              </div>
              <div className="space-y-3 flex-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Rate Limit</span>
                  <span className="font-medium">{tier.rateLimit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Query Depth</span>
                  <span className="font-medium">{tier.queryDepth}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Complexity</span>
                  <span className="font-medium">
                    {tier.complexity.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Row Limit</span>
                  <span className="font-medium">{tier.rowLimit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Aggregations</span>
                  <span className="font-medium">
                    {tier.aggregations ? (
                      <CheckCircle2 className="w-4 h-4 text-[#4ADE80] inline" />
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              </div>
              <button
                disabled={!tier.available}
                className={`mt-6 w-full py-3 rounded-full text-sm font-semibold transition-all flex items-center justify-center gap-2 group ${
                  tier.available
                    ? 'border border-[#4ADE80]/40 bg-[#4ADE80]/[0.06] text-foreground hover:border-[#4ADE80]/60'
                    : 'border border-border/50 text-muted-foreground cursor-not-allowed opacity-50'
                }`}
              >
                {tier.available ? (
                  <>
                    Get Started
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                ) : (
                  'Coming Soon'
                )}
              </button>
            </div>
          ))}
        </motion.div>

        {/* Note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-3xl mx-auto"
        >
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Free tier is available now. Pro and Scale tiers will launch when
              credit purchasing is integrated with the gateway. All prices
              denominated in $SOCIAL tokens at market rate via Ref Finance
              oracle.
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
