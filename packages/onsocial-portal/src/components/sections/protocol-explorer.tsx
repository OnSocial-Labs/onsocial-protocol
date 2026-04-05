'use client';

import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Database, Palette, Shield, Users } from 'lucide-react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';
import { section } from '@/lib/section-styles';

const PROTOCOL_ITEMS = [
  {
    eyebrow: 'Identity',
    description: 'Shared profiles and social state — portable across dApps.',
    proof: [
      'One profile across every app',
      'Posts, follows, and social feeds',
      'Permissioned data access for dApps',
    ],
    icon: Database,
    accent: 'blue' as PortalAccent,
    href: '/sdk',
    cta: 'Open SDK',
  },
  {
    eyebrow: 'Communities',
    description: 'Groups, roles, and proposals — reusable community state.',
    proof: [
      'DAOs, clubs, and creator groups',
      'Proposals with voting and auto-execution',
      'Shared membership across dApps',
    ],
    icon: Users,
    accent: 'purple' as PortalAccent,
    href: '/sdk',
    cta: 'Open SDK',
  },
  {
    eyebrow: 'Scarces',
    description:
      'Digital goods with programmable sale, auction, and royalty rules.',
    proof: [
      'Storefronts with collections and drops',
      'Auctions, offers, and buy-now listings',
      'Subscriptions and redeemable passes',
    ],
    icon: Palette,
    accent: 'green' as PortalAccent,
    href: '/sdk',
    cta: 'Open SDK',
  },
  {
    eyebrow: 'Execution',
    description: 'Gasless transactions and flexible auth paths for dApps.',
    proof: [
      'Zero-gas onboarding for new users',
      'Telegram bots and web apps',
      'Any auth model — keys, JWTs, or meta-tx',
    ],
    icon: Shield,
    accent: 'slate' as PortalAccent,
    href: '/onapi',
    cta: 'Open OnApi',
  },
] as const;

export function ProtocolExplorer() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section id="protocol" ref={ref} className={`${section.py} relative`}>
      <div className={section.container}>
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45 }}
          className={section.heading}
        >
          Protocol
        </motion.h2>

        <div className={`${section.grid} sm:grid-cols-2`}>
          {PROTOCOL_ITEMS.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={item.eyebrow}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 + index * 0.06 }}
              >
                <Link href={item.href} className="block h-full">
                  <SurfacePanel
                    radius="xl"
                    tone="soft"
                    padding="none"
                    className="h-full overflow-hidden transition-colors hover:border-[var(--_accent-border)]"
                    style={
                      {
                        '--_accent-border': `color-mix(in srgb, ${portalColors[item.accent]} 35%, transparent)`,
                      } as React.CSSProperties
                    }
                  >
                    <div
                      className={`flex flex-col items-center text-center gap-3 ${section.card}`}
                    >
                      <div className="space-y-1">
                        <span
                          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
                          style={{ color: portalColors[item.accent] }}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {item.eyebrow}
                        </span>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </div>

                      <ul className="space-y-1.5 text-left w-full max-w-xs">
                        {item.proof.map((point) => (
                          <li
                            key={point}
                            className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                          >
                            <span
                              className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                              style={{
                                backgroundColor: portalColors[item.accent],
                              }}
                            />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </SurfacePanel>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
