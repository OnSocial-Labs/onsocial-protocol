'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { RiTelegram2Line } from 'react-icons/ri';
import { FaXTwitter } from 'react-icons/fa6';
import { Github } from 'lucide-react';

export function CommunityBanner() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <section ref={ref} className="py-2">
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5 }}
        className="container mx-auto px-4"
      >
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-y border-border/40 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <a
            href="https://t.me/onsocialprotocol"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <RiTelegram2Line className="portal-blue-icon w-3.5 h-3.5" />
            Telegram
          </a>
          <span className="text-border">/</span>
          <a
            href="https://x.com/onsocialid"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <FaXTwitter className="portal-slate-icon w-3 h-3" />
            X
          </a>
          <span className="text-border">/</span>
          <a
            href="https://github.com/OnSocial-Labs/onsocial-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <Github className="portal-purple-icon w-3.5 h-3.5" />
            GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}
