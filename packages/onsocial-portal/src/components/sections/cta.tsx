'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Coins, Handshake } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CTA() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section id="paths" ref={ref} className="py-20 relative">
      <div className="container mx-auto px-4">
        <div className="max-w-5xl mx-auto border-y border-border/50 divide-y divide-border/50">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid gap-5 py-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6 lg:py-8"
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="portal-purple-frame flex h-10 w-10 items-center justify-center rounded-2xl border md:h-12 md:w-12">
                  <Handshake className="portal-purple-icon h-5 w-5 md:h-6 md:w-6" />
                </div>
                <h3 className="text-xl font-bold tracking-[-0.02em] md:text-2xl">
                  OnSocial rewards
                </h3>
              </div>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Already running in the OnSocial Telegram channel. Bring them to your community.
              </p>
            </div>

            <Button
              variant="secondary"
              asChild
              className="group w-full lg:w-auto lg:justify-self-end"
            >
              <Link href="/partners">
                Rewards setup
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="grid gap-5 py-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6 lg:py-8"
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="portal-blue-frame flex h-10 w-10 items-center justify-center rounded-2xl border md:h-12 md:w-12">
                  <Coins className="portal-blue-icon h-5 w-5 md:h-6 md:w-6" />
                </div>
                <h3 className="text-xl font-bold tracking-[-0.02em] md:text-2xl">
                  Staking
                </h3>
              </div>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Lock SOCIAL for protocol rewards.
              </p>
            </div>

            <Button
              asChild
              className="group w-full lg:w-auto lg:justify-self-end"
            >
              <Link href="/staking">
                Staking
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
          </motion.div>
        </div>


      </div>
    </section>
  );
}
