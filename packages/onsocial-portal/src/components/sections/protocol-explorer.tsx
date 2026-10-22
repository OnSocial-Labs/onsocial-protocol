'use client';

import Link from 'next/link';
import { motion, useInView } from 'framer-motion';
import { useRef, type CSSProperties } from 'react';
import { ArrowUpRight, Fingerprint, Key, Palette, Users } from 'lucide-react';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { portalColors, type PortalAccent } from '@/lib/portal-colors';
import { section } from '@/lib/section-styles';

const PROTOCOL_CARDS = [
  {
    label: 'Identity',
    detail: 'One profile, posts, and stand.',
    href: '/sdk/identity-content',
    icon: Fingerprint,
    accent: 'blue' as PortalAccent,
  },
  {
    label: 'Groups',
    detail: 'Membership, roles, and group posts.',
    href: '/sdk/groups-governance',
    icon: Users,
    accent: 'purple' as PortalAccent,
  },
  {
    label: 'Scarces',
    detail: 'Mint, list, and trade.',
    href: '/sdk/economy',
    icon: Palette,
    accent: 'green' as PortalAccent,
  },
  {
    label: 'OnAPI',
    detail: 'An app key and permissioned reads.',
    href: '/onapi',
    icon: Key,
    accent: 'gold' as PortalAccent,
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
          {PROTOCOL_CARDS.map((item, index) => {
            const Icon = item.icon;

            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 + index * 0.06 }}
              >
                <Link href={item.href} className="group block h-full">
                  <SurfacePanel
                    radius="xl"
                    tone="soft"
                    padding="none"
                    className="h-full overflow-hidden transition-[border-color,box-shadow] duration-200 hover:border-[var(--_accent-border)] hover:shadow-[0_0_20px_var(--_accent-shadow)]"
                    style={
                      {
                        '--_accent-border': `color-mix(in srgb, ${portalColors[item.accent]} 35%, transparent)`,
                        '--_accent-shadow': `color-mix(in srgb, ${portalColors[item.accent]} 20%, transparent)`,
                      } as CSSProperties
                    }
                  >
                    <div className="flex flex-col items-center px-5 py-6 text-center lg:px-6">
                      <span
                        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em]"
                        style={{ color: portalColors[item.accent] }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.label}
                        <ArrowUpRight className="h-3 w-3 opacity-40 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" />
                      </span>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
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
