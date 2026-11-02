'use client';

import { usePortalNetwork } from '@/contexts/portal-network-context';
import { cn } from '@/lib/utils';

export function TransparencyProtocolContracts({
  className,
}: {
  className?: string;
}) {
  const { profile } = usePortalNetwork();
  const contracts = [
    { label: 'Boost', contract: profile.contracts.boost },
    { label: 'Rewards', contract: profile.contracts.rewards },
    { label: 'Social spend', contract: profile.contracts.socialSpend },
  ];
  return (
    <div className={cn('px-1 text-center', className)}>
      <p className="portal-type-micro text-muted-foreground/60">
        Protocol contracts
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        {contracts.map((item, index) => (
          <span
            key={item.contract}
            className="inline-flex items-center gap-1.5"
          >
            {index > 0 ? (
              <span aria-hidden className="text-muted-foreground/35">
                ·
              </span>
            ) : null}
            <a
              href={`${profile.explorerUrl}/address/${item.contract}`}
              target="_blank"
              rel="noopener noreferrer"
              className="portal-type-micro portal-link text-muted-foreground/80 transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}
