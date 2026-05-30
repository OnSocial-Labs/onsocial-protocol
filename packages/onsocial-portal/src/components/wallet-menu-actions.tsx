'use client';

import { ExternalLink, LogOut, RefreshCw, Search } from 'lucide-react';
import {
  walletMenuActionDockButtonClass,
  walletMenuActionDockClass,
  walletMenuActionDockDisconnectClass,
  walletMenuActionDockDividerClass,
  walletMenuActionDockGroupClass,
} from '@/components/ui/floating-panel';
import { walletDropdownAccessoryIconStroke } from '@/components/ui/inline-icon-button';
import { cn } from '@/lib/utils';

interface WalletMenuActionDockProps {
  onDiscover: () => void;
  onExplorer: () => void;
  onSwitch: () => void;
  onDisconnect: () => void;
}

const dockActions = [
  {
    id: 'discover',
    ariaLabel: 'Discover profiles',
    Icon: Search,
  },
  {
    id: 'explorer',
    ariaLabel: 'View on explorer',
    Icon: ExternalLink,
  },
  {
    id: 'switch',
    ariaLabel: 'Switch wallet',
    Icon: RefreshCw,
  },
] as const;

export function WalletMenuActionDock({
  onDiscover,
  onExplorer,
  onSwitch,
  onDisconnect,
}: WalletMenuActionDockProps) {
  const iconStroke = walletDropdownAccessoryIconStroke;
  const handlers = {
    discover: onDiscover,
    explorer: onExplorer,
    switch: onSwitch,
  } as const;

  return (
    <nav className={walletMenuActionDockClass} aria-label="Wallet shortcuts">
      <div className={walletMenuActionDockGroupClass}>
        {dockActions.map(({ id, ariaLabel, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={handlers[id]}
            className={walletMenuActionDockButtonClass}
            aria-label={ariaLabel}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={iconStroke} />
          </button>
        ))}
      </div>

      <div className={walletMenuActionDockDividerClass} aria-hidden />

      <button
        type="button"
        onClick={onDisconnect}
        className={cn(
          walletMenuActionDockButtonClass,
          'aspect-square w-8 shrink-0 md:h-9 md:w-9',
          walletMenuActionDockDisconnectClass
        )}
        aria-label="Disconnect wallet"
      >
        <LogOut className="h-4 w-4 shrink-0" strokeWidth={iconStroke} />
      </button>
    </nav>
  );
}
