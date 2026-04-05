'use client';

import { motion } from 'framer-motion';
import { section } from '@/lib/section-styles';

export function Hero() {
  return (
    <section className="relative flex min-h-[64vh] items-center justify-center overflow-hidden pt-20 md:min-h-[72vh] md:pt-16">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(74,222,128,0.10), transparent 32%), radial-gradient(circle at 70% 20%, rgba(96,165,250,0.08), transparent 26%)',
        }}
      />
      <div className={`${section.container} relative z-10`}>
        <div className="mx-auto max-w-3xl space-y-6 text-center md:space-y-7">
          <div className="relative mx-auto flex w-fit max-w-full flex-col items-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative max-w-full text-[3rem] font-bold leading-[0.92] tracking-[-0.05em] sm:text-5xl md:text-7xl lg:text-[5.5rem]"
            >
              Own the <span className="portal-green-text">Graph.</span>
            </motion.h1>
            <div className="pointer-events-none relative mt-5 h-3 w-[calc(100%-1rem)] max-w-[44rem] opacity-60 sm:w-[calc(100%-1.5rem)]">
              <div
                className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(107,114,128,0.16) 12%, rgba(96,165,250,0.24) 46%, rgba(74,222,128,0.26) 54%, rgba(107,114,128,0.16) 88%, transparent 100%)',
                  boxShadow: '0 0 14px rgba(96,165,250,0.1)',
                }}
              />
              <div
                className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 opacity-45"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 30%, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.22) 70%, transparent 100%)',
                }}
              />
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mx-auto max-w-2xl"
          >
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              <span className="block">
                Identity, relationships, and social state — portable across
                dApps.
              </span>
              <span className="mt-1 block">Let the graph move with you.</span>
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
