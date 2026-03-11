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
    <section ref={ref} className="py-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.5 }}
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground"
      >
        <a
          href="https://t.me/onsocialprotocol"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <RiTelegram2Line className="w-4 h-4 text-[#60A5FA]" />
          Join builders, earn $SOCIAL
        </a>
        <span className="text-border">·</span>
        <a
          href="https://x.com/onsocialid"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <FaXTwitter className="w-3.5 h-3.5" />
          See what's shipping
        </a>
        <span className="text-border">·</span>
        <a
          href="https://github.com/OnSocial-Labs/onsocial-protocol"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <Github className="w-3.5 h-3.5 text-[#C084FC]" />
          Read the code
        </a>
      </motion.div>
    </section>
  );
}
