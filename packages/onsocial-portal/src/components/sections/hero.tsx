'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Hero() {
  const scrollToProtocol = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('protocol');
    if (el) {
      const offset = 80;
      const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[80vh] flex items-center justify-center pt-24 md:pt-16">
      {/* Subtle dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          opacity: 0.04,
          maskImage:
            'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 70%), linear-gradient(to bottom, black 40%, transparent 85%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 70% 60% at 50% 40%, black 20%, transparent 70%), linear-gradient(to bottom, black 40%, transparent 85%)',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      />
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          {/* Main heading */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-[-0.03em] leading-[0.9]"
          >
            One Profile.
            <br />
            <span className="text-[#4ADE80]">Every App.</span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed"
          >
            Shared social infrastructure on NEAR —{' '}
            <span className="text-[#4ADE80]">profiles</span>,{' '}
            <span className="text-[#60A5FA]">groups</span>,{' '}
            <span className="text-[#C084FC]">Scarces</span>, and gasless
            interactions across every dapp on the protocol.
          </motion.p>

          {/* Single CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Button size="lg" variant="accent" asChild className="group">
              <a href="#protocol" onClick={scrollToProtocol}>
                Explore Protocol
                <ChevronDown className="w-4 h-4 ml-2 group-hover:translate-y-0.5 transition-transform" />
              </a>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
