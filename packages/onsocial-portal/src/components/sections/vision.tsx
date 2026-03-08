'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import {
  User, Users, Palette, ShoppingCart,
  Zap, Database, Shield, Layers, KeyRound
} from 'lucide-react'

// What the protocol actually enables (backed by real contracts)
const PROTOCOL_LAYERS = [
  {
    title: 'Identity & Data',
    description: 'One on-chain profile shared across every dapp. Store profiles, posts, and dapp data with fine-grained permissions.',
    icon: User,
    color: '#3B82F6',
    contract: 'core-onsocial',
    capabilities: ['Social profiles', 'Key-value storage', 'Permissions'],
  },
  {
    title: 'Groups & Governance',
    description: 'Create communities with membership, permission controls, proposals, and on-chain voting.',
    icon: Users,
    color: '#A855F7',
    contract: 'core-onsocial',
    capabilities: ['Group management', 'Proposals & voting', 'Role-based access'],
  },
  {
    title: 'Scarces',
    description: 'Mint, list, sell, and auction Scarces — NFTs with a lifecycle. Renewable, redeemable, revocable, with automatic royalty splits.',
    icon: Palette,
    color: '#4ADE80',
    contract: 'scarces-onsocial',
    capabilities: ['Minting & collections', 'Auctions & offers', 'Royalties'],
  },
  {
    title: 'Social Commerce',
    description: 'Buy and sell directly from social feeds. Multi-token payments via NEAR Intents, stores, and seamless checkout.',
    icon: ShoppingCart,
    color: '#3B82F6',
    contract: 'core-onsocial',
    capabilities: ['Feed-based shopping', 'Multi-token payments', 'Stores'],
  },
] as const

const INFRA_FEATURES = [
  { title: 'Gasless', icon: Zap, color: '#4ADE80' },
  { title: 'Sponsored Storage', icon: Database, color: '#3B82F6' },
  { title: 'Dapp Rewards', icon: Shield, color: '#A855F7' },
  { title: 'Composable', icon: Layers, color: '#4ADE80' },
  { title: 'Indexers', icon: Database, color: '#3B82F6' },
] as const

export function Vision() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.1 })

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
            Dapps with seamless onboarding — shared profiles, organizations, and commerce. One OnApi key to integrate.
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
                  style={{ borderColor: `${layer.color}30`, border: `1px solid ${layer.color}30` }}
                >
                  <layer.icon className="w-5 h-5" style={{ color: layer.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold tracking-[-0.02em] mb-1">{layer.title}</h3>
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
            <KeyRound className="w-4 h-4 text-[#4ADE80]" />
            <span className="text-sm font-semibold tracking-[-0.02em]">One OnApi key. Everything included.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            {INFRA_FEATURES.map((feature) => (
              <div key={feature.title} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <feature.icon className="w-3.5 h-3.5" style={{ color: feature.color }} />
                <span>{feature.title}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}
