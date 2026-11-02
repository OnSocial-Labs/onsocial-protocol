'use client';

import { usePortalNetwork } from '@/contexts/portal-network-context';
import { useWallet } from '@/contexts/wallet-context';
import { clearStoredPortalSessions } from '@/lib/portal-social-session';
import type { PortalNearNetwork } from '@/lib/portal-network';
import { cn } from '@/lib/utils';

const OPTIONS: { id: PortalNearNetwork; label: string }[] = [
  { id: 'testnet', label: 'Testnet' },
  { id: 'mainnet', label: 'Mainnet' },
];

export function PortalNetworkToggle({ className }: { className?: string }) {
  const { network, chooseNetwork, switching } = usePortalNetwork();
  const { disconnect } = useWallet();

  async function select(next: PortalNearNetwork) {
    if (next === network || switching) return;
    await Promise.race([
      disconnect().catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, 1500)),
    ]);
    clearStoredPortalSessions();
    chooseNetwork(next);
  }

  return (
    <div
      role="group"
      aria-label="Network"
      className={cn(
        'inline-flex h-9 items-center rounded-full border border-border/45 bg-background/70 p-0.5 md:h-10',
        className
      )}
    >
      {OPTIONS.map((option) => {
        const selected = network === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            disabled={switching}
            onClick={() => void select(option.id)}
            className={cn(
              'h-full rounded-full px-2.5 text-[11px] font-medium tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:px-3',
              selected
                ? 'bg-background/88 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
