'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Globe, Zap, FileCode2, Layers, Package, Terminal } from 'lucide-react';
import { SectionHeader } from '@/components/layout/section-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';

const tools = [
  {
    title: 'Gateway API',
    description:
      'Auth, GraphQL, relay, compose, and storage behind one live entry point for dApps building on the graph.',
    icon: Globe,
    accent: 'blue' as PortalAccent,
    status: 'Live',
  },
  {
    title: 'Gasless Relayer',
    description:
      'Sponsored execution keeps social actions light for users while the relayer handles signing and availability.',
    icon: Zap,
    accent: 'green' as PortalAccent,
    status: 'Live',
  },
  {
    title: 'Smart Contracts',
    description:
      'Core social state, Boost, Scarces, rewards, and token logic are already running on-chain today.',
    icon: FileCode2,
    accent: 'purple' as PortalAccent,
    status: 'Live',
  },
  {
    title: 'Compose API',
    description:
      'One-call flows for minting, collections, marketplace actions, approvals, and media-backed storage.',
    icon: Layers,
    accent: 'blue' as PortalAccent,
    status: 'Live',
  },
  {
    title: 'Developer SDKs',
    description:
      'SDKs for rewards, resilient NEAR calls, and partner registration so dApps can plug into the network faster.',
    icon: Package,
    accent: 'green' as PortalAccent,
    status: 'Live',
  },
  {
    title: 'Playground',
    description:
      'A live testnet editor for connecting a wallet, running real transactions, and testing the flow before shipping.',
    icon: Terminal,
    accent: 'purple' as PortalAccent,
    status: 'Live',
  },
];

export function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section id="tools" ref={ref} className="py-24 relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-16"
        >
          <SectionHeader
            align="center"
            size="display"
            contentClassName="max-w-2xl"
            title="What Keeps It Live"
            description="The stack behind identity, rewards, sponsored actions, and dApps that share the same graph."
          />
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <motion.div
                key={tool.title}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <SurfacePanel
                  radius="xl"
                  tone="muted"
                  padding="spacious"
                  interactive
                  className="h-full"
                >
                  <div className="flex items-start justify-between mb-5">
                    <Icon
                      className="w-10 h-10"
                      style={{ color: portalColors[tool.accent] }}
                    />
                    <PortalBadge accent="green">{tool.status}</PortalBadge>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 tracking-[-0.01em]">
                    {tool.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tool.description}
                  </p>
                </SurfacePanel>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
