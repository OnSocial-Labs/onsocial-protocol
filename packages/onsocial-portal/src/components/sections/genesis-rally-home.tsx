'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { GenesisRallyStrip } from '@/features/season/genesis-rally-strip';
import { section } from '@/lib/section-styles';

/** Home promo for Season 0 — join strip + link to full standings. */
export function GenesisRallyHome() {
  return (
    <section className={section.py}>
      <div className={section.container}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45 }}
          className="mx-auto max-w-2xl space-y-3"
        >
          <GenesisRallyStrip />
          <p className="text-center">
            <Link
              href="/season-zero"
              prefetch
              className="inline-flex items-center gap-1.5 portal-eyebrow text-muted-foreground transition-colors hover:text-[var(--portal-gold)]"
            >
              View Season 0 standings
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </p>
        </motion.div>
      </div>
    </section>
  );
}
