'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import Link from 'next/link';
import { Palette, Ticket, Users, Building2, ArrowUpRight } from 'lucide-react';
import { SectionHeader } from '@/components/layout/section-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import { SurfacePanel } from '@/components/ui/surface-panel';
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
          className="mb-16"
        >
          <SectionHeader
            align="center"
            size="display"
            contentClassName="max-w-2xl"
            title="What You Can Build"
            description="Real use cases powered by OnSocial's live infrastructure."
          />
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
                <SurfacePanel
                  radius="xl"
                  tone="muted"
                  padding="spacious"
                  interactive
                  className="h-full"
                >
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
                      <PortalBadge key={api} accent="slate" size="xs">
                        {api}
                      </PortalBadge>
                    ))}
                  </div>
                </SurfacePanel>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
