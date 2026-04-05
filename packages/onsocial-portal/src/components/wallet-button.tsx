'use client';

import { AnimatePresence } from 'framer-motion';
import { motion } from 'framer-motion';
import {
  Wallet,
  ChevronDown,
  LogOut,
  RefreshCw,
  User,
  ExternalLink,
} from 'lucide-react';
import { useWallet } from '@/contexts/wallet-context';
import { cn } from '@/lib/utils';
import {
  floatingPanelDividerClass,
  floatingPanelItemClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import {
  utilityButtonActiveClass,
  utilityButtonClass,
  utilityIconTransition,
} from '@/components/ui/utility-button';
import { useDropdown } from '@/hooks/use-dropdown';
import { ACTIVE_NEAR_EXPLORER_URL } from '@/lib/near-network';

interface WalletButtonProps {
  compact?: boolean;
  menuAlign?: 'left' | 'right';
  disconnectedLabel?: string;
}

export function WalletButton({
  compact = false,
  menuAlign = 'right',
  disconnectedLabel,
}: WalletButtonProps) {
  const { accountId, isConnected, connect, disconnect } = useWallet();
  const menu = useDropdown();

  const handleDisconnect = async () => {
    await disconnect();
    menu.close();
  };

  const handleSwitchWallet = async () => {
    menu.close();
    await connect();
  };

  const compactDisconnectedButtonClass = disconnectedLabel
    ? 'group relative inline-flex h-9 w-auto items-center justify-center gap-2.5 rounded-full border border-border/45 bg-background/70 px-3 pr-3.5 text-muted-foreground backdrop-blur-md transition-all duration-300 hover:border-border/70 hover:bg-background/84 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-10 md:px-3.5 md:pr-4'
    : 'group relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/45 bg-background/70 text-foreground backdrop-blur-md transition-all duration-300 hover:border-border/70 hover:bg-background/84 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background md:h-10 md:w-10';

  if (!isConnected) {
    return (
      <button
        onClick={() => connect()}
        className={cn(
          compact
            ? compactDisconnectedButtonClass
            : 'portal-blue-surface flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all'
        )}
        aria-label="Connect wallet"
      >
        {compact ? (
          <>
            <motion.span
              initial={false}
              animate={{
                opacity: 0.5,
                scale: 1,
                rotate: 0,
              }}
              transition={utilityIconTransition}
              className="pointer-events-none absolute inset-1 rounded-[0.9rem] bg-transparent dark:bg-[color:var(--portal-blue-frame-bg)]"
            />

            <motion.span
              initial={false}
              animate={{
                rotate: 180,
                scale: 1,
                opacity: 0.14,
              }}
              transition={utilityIconTransition}
              className="pointer-events-none absolute inset-[7px] rounded-[0.8rem] bg-transparent dark:bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.45),transparent_62%)]"
            />

            <span className="relative z-10 h-4 w-4">
              <motion.span
                initial={false}
                animate={{
                  scale: 1,
                  rotate: 0,
                  y: 0,
                  opacity: 1,
                }}
                transition={utilityIconTransition}
                className="absolute inset-0 flex items-center justify-center portal-blue-text"
              >
                <Wallet className="h-4 w-4" />
              </motion.span>

              <motion.span
                initial={false}
                animate={{
                  opacity: 0.72,
                  scale: 0.96,
                }}
                transition={utilityIconTransition}
                className="absolute inset-0 rounded-full bg-transparent blur-[6px] dark:bg-[var(--portal-blue)]/18"
              />
            </span>

            {disconnectedLabel ? (
              <span className="relative z-10 whitespace-nowrap text-sm font-medium text-current transition-colors">
                {disconnectedLabel}
              </span>
            ) : null}
          </>
        ) : (
          <Wallet className="h-4 w-4" />
        )}
        {!compact ? (
          <span className="hidden sm:inline">Let's connect</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="relative" ref={menu.containerRef}>
      <button
        onClick={menu.toggle}
        className={cn(
          compact
            ? cn(
                utilityButtonClass,
                'border border-border/45 bg-background/70 text-foreground shadow-[0_12px_30px_-18px_rgba(15,23,42,0.34)] hover:border-border/70 hover:shadow-[0_14px_34px_-18px_var(--portal-green-shadow)]',
                menu.isOpen && utilityButtonActiveClass
              )
            : 'flex items-center gap-2 rounded-full border border-border/40 bg-background/65 px-3 py-2 text-muted-foreground shadow-[0_10px_30px_-18px_rgba(15,23,42,0.34)] backdrop-blur-md transition-all duration-300 hover:bg-background/80 hover:text-foreground'
        )}
        aria-label={menu.isOpen ? 'Close wallet menu' : 'Open wallet menu'}
        aria-expanded={menu.isOpen}
        aria-haspopup="menu"
      >
        {compact ? (
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="absolute h-4 w-4 rounded-full border border-[var(--portal-green-border)] bg-[var(--portal-green-bg)] shadow-[0_0_0_5px_var(--portal-green-shadow)] opacity-70 transition-transform duration-300 group-hover:scale-110" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-[var(--portal-green)] shadow-[0_0_14px_var(--portal-green-shadow)] animate-pulse transition-transform duration-300 group-hover:scale-110" />
          </span>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="portal-green-dot h-2 w-2 rounded-full animate-pulse"></div>
              <Wallet className="h-4 w-4" />
              <span className="text-foreground text-sm font-medium max-w-[100px] truncate hidden sm:block">
                {accountId}
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform ${menu.isOpen ? 'rotate-180' : ''}`}
            />
          </>
        )}
      </button>

      <FloatingPanelMenu
        open={menu.isOpen}
        align={menuAlign === 'left' ? 'left' : 'right'}
        className="w-56 md:w-64"
      >
        <div className="border-b border-fade-section px-3 py-2.5 md:px-4 md:py-3">
          <p className="mb-0.5 text-[11px] md:text-xs text-muted-foreground/70">
            Connected Account
          </p>
          <p className="truncate text-[13px] md:text-sm font-medium text-foreground">
            {accountId}
          </p>
        </div>

        <div className="space-y-0.5 p-1 md:p-1.5">
          <button
            onClick={() => {
              window.open(
                `${ACTIVE_NEAR_EXPLORER_URL}/address/${accountId}`,
                '_blank'
              );
              menu.close();
            }}
            className={floatingPanelItemClass}
          >
            <User className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span>View on Explorer</span>
            <ExternalLink className="ml-auto h-3 w-3 opacity-40" />
          </button>

          <button
            onClick={handleSwitchWallet}
            className={floatingPanelItemClass}
          >
            <RefreshCw className="h-3.5 w-3.5 md:h-4 md:w-4" />
            <span>Switch Wallet</span>
          </button>

          <div className={floatingPanelDividerClass}></div>

          <button
            onClick={handleDisconnect}
            className={cn(
              floatingPanelItemClass,
              'text-[var(--portal-red)] hover:bg-[var(--portal-red-bg)] hover:text-[var(--portal-red)] focus-visible:bg-[var(--portal-red-bg)] focus-visible:text-[var(--portal-red)]'
            )}
          >
            <LogOut className="h-3.5 w-3.5 md:h-4 md:w-4 text-[var(--portal-red)]" />
            <span>Disconnect</span>
          </button>
        </div>
      </FloatingPanelMenu>
    </div>
  );
}
