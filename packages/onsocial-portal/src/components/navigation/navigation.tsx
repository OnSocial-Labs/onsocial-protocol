'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { BrandLogo } from '@/components/brand-logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { WalletButton } from '@/components/wallet-button';
import { useWallet } from '@/contexts/wallet-context';
import { ADMIN_WALLETS } from '@/lib/portal-config';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Home', href: '/', isAnchor: false },
  { label: 'SDK', href: '/sdk', isAnchor: false },
  { label: 'Transparency', href: '/transparency', isAnchor: false },
  { label: 'OnApi', href: '/onapi', isAnchor: false },
  { label: 'Staking', href: '/staking', isAnchor: false },
  { label: 'Partners', href: '/partners', isAnchor: false },
];

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const { accountId } = useWallet();
  const pathname = usePathname();

  const isAdmin = accountId && ADMIN_WALLETS.includes(accountId.toLowerCase());

  const visibleNavItems = useMemo(
    () =>
      isAdmin
        ? [...navItems, { label: 'Admin', href: '/admin', isAnchor: false }]
        : navItems,
    [isAdmin]
  );

  const handleSmoothScroll = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (href.startsWith('#')) {
      e.preventDefault();

      // If we're not on the homepage, navigate there first
      if (window.location.pathname !== '/') {
        window.location.assign('/' + href);
        setIsOpen(false);
        return;
      }

      // If we're on homepage, scroll to the element
      const element = document.querySelector(href);
      if (element) {
        const offset = 80; // Account for fixed header
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
        setIsOpen(false);
      }
    }
  };

  const isActiveItem = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50"
    >
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          onClick={(e) => {
            // If on homepage, scroll to top smoothly
            if (window.location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({
                top: 0,
                behavior: 'smooth',
              });
            }
            setIsOpen(false);
          }}
          className="flex items-center"
        >
          <BrandLogo className="h-10 w-10" />
        </Link>

        <div className="hidden md:flex items-center space-x-6">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => item.isAnchor && handleSmoothScroll(e, item.href)}
              className={cn(
                'text-sm transition-colors',
                isActiveItem(item.href)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                item.label === 'Admin' && !isActiveItem(item.href) &&
                  'portal-purple-text'
              )}
              aria-current={isActiveItem(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-6">
          <ThemeToggle />
          <WalletButton />
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden items-center space-x-2">
          <ThemeToggle />
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-muted-foreground hover:text-foreground transition-colors relative"
          >
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <X className="h-5 w-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="menu"
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: -90, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Menu className="h-5 w-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 top-16 bg-background/80 backdrop-blur-xl md:hidden"
              onClick={() => setIsOpen(false)}
            />

            {/* Menu */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="absolute top-16 left-0 right-0 bg-background border-b border-border md:hidden"
            >
              <div className="container mx-auto px-4 py-6 space-y-4">
                {visibleNavItems.map((item, i) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                  >
                    <Link
                      href={item.href}
                      onClick={(e) => {
                        if (item.isAnchor) {
                          handleSmoothScroll(e, item.href);
                        } else {
                          setIsOpen(false);
                        }
                      }}
                      className={cn(
                        'block text-lg font-medium transition-colors py-2',
                        isActiveItem(item.href)
                          ? 'text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                        item.label === 'Admin' && !isActiveItem(item.href) &&
                          'portal-purple-text'
                      )}
                      aria-current={isActiveItem(item.href) ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: visibleNavItems.length * 0.05,
                    duration: 0.3,
                  }}
                  className="pt-4 flex flex-col space-y-2"
                >
                  <div className="w-full mb-2">
                    <WalletButton />
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
