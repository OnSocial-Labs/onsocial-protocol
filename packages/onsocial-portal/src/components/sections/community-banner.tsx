'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { RiTelegram2Line } from 'react-icons/ri';
import { FaXTwitter } from 'react-icons/fa6';
import { Github } from 'lucide-react';
import { section } from '@/lib/section-styles';

export function CommunityBanner() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <section ref={ref} className="py-2">
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5 }}
        className={section.container}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
          <a
            href="https://t.me/onsocialprotocol"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <RiTelegram2Line className="portal-blue-icon h-3.5 w-3.5" />
            Telegram
          </a>
          <span className="hidden text-border sm:inline">/</span>
          <a
            href="https://x.com/onsocialid"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <FaXTwitter className="portal-slate-icon h-3 w-3" />X
          </a>
          <span className="hidden text-border sm:inline">/</span>
          <a
            href="https://github.com/OnSocial-Labs/onsocial-protocol"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <Github className="portal-purple-icon h-3.5 w-3.5" />
            GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}
