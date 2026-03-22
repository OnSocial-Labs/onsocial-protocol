'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import Link from 'next/link';
import { Palette, Ticket, Users, Building2, ArrowUpRight } from 'lucide-react';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';

const USE_CASES = [
  {
    title: 'NFT Marketplace',
    description:
      'Mint, list, and trade NFTs with built-in royalties. One API call via /compose/mint.',
    icon: Palette,
    accent: 'purple' as PortalAccent,
    apis: ['Compose API', 'Scarces Contract', 'IPFS Storage'],
  },
  {
    title: 'Event Ticketing',
    description:
      'Issue NFT tickets with on-chain verification. Gate access with token ownership.',
    icon: Ticket,
    accent: 'blue' as PortalAccent,
    apis: ['Compose API', 'Token Gates', 'Gasless Claims'],
  },
  {
    title: 'Communities',
    description:
      'Token-gated groups with on-chain social graph. Posts, follows, likes — all composable.',
    icon: Users,
    accent: 'green' as PortalAccent,
    apis: ['Core Contract', 'Groups API', 'Social Graph'],
  },
  {
    title: 'Company Profiles',
    description:
      'Verified business identities with on-chain reputation and team management.',
    icon: Building2,
    accent: 'blue' as PortalAccent,
    apis: ['Core Contract', 'Stores API', 'Permissions'],
  },
] as const;

export function BuilderShowcase() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section ref={ref} className="py-24 relative">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold tracking-[-0.03em] mb-4">
            What You Can Build
          </h2>
          <p className="text-lg text-muted-foreground">
            Real use cases powered by OnSocial&apos;s live infrastructure
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {USE_CASES.map((useCase, index) => {
            const Icon = useCase.icon;
            return (
              <motion.div
                key={useCase.title}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <div className="border border-border/50 rounded-2xl p-8 hover:border-border transition-colors bg-muted/30 h-full">
                  <div className="flex items-start justify-between mb-4">
                    <Icon
                      className="w-8 h-8"
                      style={{ color: portalColors[useCase.accent] }}
                    />
                    <Link
                      href="/playground"
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      Try it
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 tracking-[-0.01em]">
                    {useCase.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                    {useCase.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {useCase.apis.map((api) => (
                      <span
                        key={api}
                        className="text-xs px-2.5 py-1 rounded-full border border-border/50 text-muted-foreground"
                      >
                        {api}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
