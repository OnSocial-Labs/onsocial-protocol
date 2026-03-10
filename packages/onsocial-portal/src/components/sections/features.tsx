'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import {
  Globe,
  Zap,
  FileCode2,
  Layers,
  Package,
  Terminal,
} from 'lucide-react'

const tools = [
  {
    title: 'Gateway API',
    description: 'Auth, GraphQL, relay, compose, storage — one endpoint at api.onsocial.id. JWT-based with tier rate limiting.',
    icon: Globe,
    color: '#3B82F6',
    status: 'Live',
  },
  {
    title: 'Gasless Relayer',
    description: 'Users never pay gas. 2-instance HA with GCP Cloud KMS signing and automatic key pool management.',
    icon: Zap,
    color: '#4ADE80',
    status: 'Live',
  },
  {
    title: 'Smart Contracts',
    description: 'Core, Token, Staking, Scarces, Rewards — 6 contracts on testnet, token verified on mainnet.',
    icon: FileCode2,
    color: '#A855F7',
    status: 'Live',
  },
  {
    title: 'Compose API',
    description: 'One-call endpoints: mint, collection, marketplace, offers, approvals, storage uploads via Lighthouse IPFS.',
    icon: Layers,
    color: '#3B82F6',
    status: 'Live',
  },
  {
    title: 'Developer SDKs',
    description: '@onsocial-id/rewards for token rewards, @onsocial-id/rpc for resilient NEAR calls, partner API for app registration.',
    icon: Package,
    color: '#4ADE80',
    status: 'Live',
  },
  {
    title: 'Playground',
    description: 'Browser code editor with live testnet execution. Connect wallet, run real transactions, test your integration.',
    icon: Terminal,
    color: '#A855F7',
    status: 'Live',
  },
]

export function Features() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section id="tools" ref={ref} className="py-24 relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-[-0.03em] mb-4">
            Developer Tools
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything running in production today
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool, index) => {
            const Icon = tool.icon
            return (
              <motion.div
                key={tool.title}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <div className="border border-border/50 rounded-2xl p-8 hover:border-border transition-colors bg-muted/30 h-full">
                  <div className="flex items-start justify-between mb-5">
                    <Icon className="w-10 h-10" style={{ color: tool.color }} />
                    <span className="text-xs px-2.5 py-1 rounded-full border border-[#4ADE80]/30 text-[#4ADE80] font-medium">
                      {tool.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 tracking-[-0.01em]">{tool.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tool.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
