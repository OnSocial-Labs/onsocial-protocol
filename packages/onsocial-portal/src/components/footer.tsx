'use client'

import Link from 'next/link'
import { Github, Code } from 'lucide-react'
import { FaXTwitter } from 'react-icons/fa6'
import { IoMdHeart } from 'react-icons/io'
import { RiTelegram2Line } from 'react-icons/ri'

const footerLinks = {
  Product: [
    { label: 'SDK', href: '/sdk' },
    { label: 'Transparency', href: '/transparency' },
    { label: 'OnApi', href: '/onapi' },
    { label: 'Staking', href: '/staking' },
    { label: 'Partners', href: '/partners' },
  ],
  Resources: [
    { label: 'GitHub', href: 'https://github.com/OnSocial-Labs' },
    { label: 'License', href: '/LICENSE.md' },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border/50 bg-background">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
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
              <span className="font-semibold text-lg tracking-[-0.02em]">OnSocial</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Building the future of decentralized social.
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

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-semibold mb-4">{category}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span>{new Date().getFullYear()} OnSocial Labs</span>
            <Code className="w-3.5 h-3.5" />
            <span>Open source</span>
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            Built with <IoMdHeart className="text-[#4ADE80] w-4 h-4" /> on NEAR Protocol
          </p>
        </div>
      </div>
    </footer>
  )
}
