'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Hero() {
  const scrollToPaths = (e: React.MouseEvent) => {
    e.preventDefault();
    const el = document.getElementById('paths');
    if (el) {
      const offset = 80;
      const top = el.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[72vh] flex items-center justify-center pt-24 md:pt-16 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 30%, rgba(74,222,128,0.10), transparent 32%), radial-gradient(circle at 70% 20%, rgba(96,165,250,0.08), transparent 26%)',
        }}
      />
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center space-y-7">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="text-xs uppercase tracking-[0.24em] text-muted-foreground"
          >
            OnSocial Protocol
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-[-0.05em] leading-[0.92]"
          >
            Shared identity.
            <br />
            <span className="portal-green-text">Every app.</span>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex items-center gap-4 justify-center"
          >
            <Button size="lg" variant="accent" asChild className="group">
              <a href="#paths" onClick={scrollToPaths}>
                See what's live
                <ChevronDown className="w-4 h-4 ml-2 group-hover:translate-y-0.5 transition-transform" />
              </a>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
