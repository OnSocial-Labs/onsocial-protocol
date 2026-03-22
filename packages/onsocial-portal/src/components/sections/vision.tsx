'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  User,
  Users,
  Palette,
  Shield,
  Zap,
  Database,
  Layers,
  Puzzle,
} from 'lucide-react';
import { portalColors, portalFrameStyle, type PortalAccent } from '@/lib/portal-colors';

// What the protocol actually enables (backed by real contracts)
const PROTOCOL_LAYERS = [
  {
    title: 'Identity & Data',
    description:
      'One on-chain profile shared across every dapp. Store profiles, posts, and dapp data with fine-grained permissions.',
    icon: User,
    accent: 'blue' as PortalAccent,
    contract: 'core-onsocial',
    capabilities: ['Social profiles', 'Key-value storage', 'Permissions'],
  },
  {
    title: 'Groups & Governance',
    description:
      'Create communities with membership, permission controls, proposals, and on-chain voting.',
    icon: Users,
    accent: 'purple' as PortalAccent,
    contract: 'core-onsocial',
    capabilities: [
      'Group management',
      'Proposals & voting',
      'Role-based access',
    ],
  },
  {
    title: 'Scarces',
    description:
      'Mint, list, sell, and auction Scarces — NFTs with a lifecycle. Renewable, redeemable, revocable, with automatic royalty splits.',
    icon: Palette,
    accent: 'green' as PortalAccent,
    contract: 'scarces-onsocial',
    capabilities: ['Minting & collections', 'Auctions & offers', 'Royalties'],
  },
  {
    title: 'Flexible Auth',
    description:
      'Four on-chain auth models — direct calls, signed payloads, meta-transactions, and NEAR Intents.',
    icon: Shield,
    accent: 'slate' as PortalAccent,
    contract: 'core-onsocial',
    capabilities: ['Meta-transactions', 'Signed payloads', 'Intents support'],
  },
] as const;

const INFRA_FEATURES = [
  { title: 'Gasless transactions', icon: Zap, accent: 'slate' as PortalAccent },
  { title: 'Sponsored storage', icon: Database, accent: 'blue' as PortalAccent },
  { title: 'Composable data', icon: Layers, accent: 'blue' as PortalAccent },
  { title: 'Real-time indexers', icon: Database, accent: 'blue' as PortalAccent },
] as const;

export function Vision() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <section id="protocol" ref={ref} className="py-24 relative">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-[-0.03em] mb-4">
            What you can build
          </h2>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Dapps with seamless onboarding — shared profiles, organizations, and
            commerce.
          </p>
        </motion.div>

        {/* Protocol layers - 2x2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-16">
          {PROTOCOL_LAYERS.map((layer, i) => (
            <motion.div
              key={layer.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="border border-border/50 rounded-2xl p-8 bg-muted/30 hover:border-border transition-colors"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={portalFrameStyle(layer.accent)}
                >
                  <layer.icon
                    className="w-5 h-5"
                    style={{ color: portalColors[layer.accent] }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold tracking-[-0.02em] mb-1">
                    {layer.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    {layer.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {layer.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="text-xs px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* One OnApi key — everything included */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="max-w-3xl mx-auto border border-border/50 rounded-2xl p-8 bg-muted/30"
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            <Puzzle className="portal-green-icon w-4 h-4" />
            <span className="text-sm font-semibold tracking-[-0.02em]">
              Built into every dapp. Zero config.
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            {INFRA_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <feature.icon
                  className="w-3.5 h-3.5"
                  style={{ color: portalColors[feature.accent] }}
                />
                <span>{feature.title}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
