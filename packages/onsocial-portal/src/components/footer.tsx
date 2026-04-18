'use client';

import Link from 'next/link';
import { section } from '@/lib/section-styles';

const dot = (
  <span aria-hidden className="text-border/60 select-none">
    ·
  </span>
);

export function Footer() {
  return (
    <footer className="border-t border-fade-section bg-background safe-bottom">
      <div className={`${section.container} py-5`}>
        <div className="flex flex-col items-center gap-1.5">
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Link
              href="https://onsocial.id"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              OnSocial
            </Link>
            {dot}
            <Link
              href="/sdk"
              aria-label="Developer SDK"
              className="font-mono text-[0.65rem] tracking-tight opacity-55 transition-[color,opacity] hover:text-[var(--portal-purple)] hover:opacity-100"
            >
              {'</>'}
            </Link>
            {dot}
            <Link
              href="https://near.org"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--portal-blue)]"
            >
              NEAR
            </Link>
          </p>
          <p className="text-[0.6rem] text-muted-foreground/35">
            Services by{' '}
            <Link href="/about" className="transition-colors hover:text-[var(--portal-purple)]">
              OnSocial Labs
            </Link>
            {' · Protocol governed by '}
            <Link href="/governance" className="transition-colors hover:text-[var(--portal-blue)]">
              DAO
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
