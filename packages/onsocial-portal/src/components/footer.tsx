'use client';

import Link from 'next/link';
import { Github, Code } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import { RiTelegram2Line } from 'react-icons/ri';

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
            <div className="flex items-center space-x-2 mb-4">
              <img
                src="/onsocial_icon.svg"
                alt="OnSocial"
                className="w-7 h-7 dark:hidden"
              />
              <img
                src="/onsocial_icon_dark.svg"
                alt="OnSocial"
                className="w-7 h-7 hidden dark:block"
              />
              <span className="font-semibold text-lg tracking-[-0.02em]">
                OnSocial
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Open social infrastructure on{' '}
              <Link
                href="https://near.org"
                target="_blank"
                className="hover:text-foreground transition-colors"
              >
                NEAR
              </Link>
              .
            </p>
            <div className="flex items-center space-x-4">
              <Link
                href="https://github.com/OnSocial-Labs"
                target="_blank"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Github className="w-5 h-5" />
              </Link>
              <Link
                href="#"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <FaXTwitter className="w-5 h-5" />
              </Link>
              <Link
                href="#"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <RiTelegram2Line className="w-6 h-6" />
              </Link>
            </div>
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span>{new Date().getFullYear()} OnSocial Labs</span>
            <Code className="w-3.5 h-3.5" />
            <span>Open source</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
