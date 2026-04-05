'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';
import { BrandLogo } from '@/components/brand-logo';
import { section } from '@/lib/section-styles';

export function Footer() {
  return (
    <footer className="border-t border-fade-section bg-background safe-bottom">
      <div className={`${section.container} py-8`}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2.5">
            <BrandLogo className="h-6 w-6" />
            <span className="text-sm font-semibold tracking-[-0.02em]">
              OnSocial
            </span>
          </div>

          <div className="flex items-center gap-3 text-muted-foreground">
            <Link
              href="https://t.me/onsocialprotocol"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram"
              className="transition-colors hover:text-[var(--portal-blue)]"
            >
              <RiTelegram2Line className="h-4 w-4" />
            </Link>
            <Link
              href="https://x.com/onsocialid"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X"
              className="transition-colors hover:text-foreground"
            >
              <FaXTwitter className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="https://github.com/OnSocial-Labs/onsocial-protocol"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="transition-colors hover:text-[var(--portal-purple)]"
            >
              <Github className="h-4 w-4" />
            </Link>
          </div>

          <p className="text-xs text-muted-foreground">
            {new Date().getFullYear()} OnSocial Labs {'</>'}{' '}
            <Link
              href="https://near.org"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--portal-blue)]"
            >
              NEAR
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
