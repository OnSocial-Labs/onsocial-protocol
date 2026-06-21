import {
  TRANSPARENCY_EXPLORER_URL,
  TRANSPARENCY_PROTOCOL_CONTRACTS,
} from '@/features/transparency/transparency-constants';
import { cn } from '@/lib/utils';

export function TransparencyProtocolContracts({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn('px-1 text-center', className)}>
      <p className="portal-type-micro text-muted-foreground/60">
        Protocol contracts
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        {TRANSPARENCY_PROTOCOL_CONTRACTS.map((item, index) => (
          <span key={item.contract} className="inline-flex items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden className="text-muted-foreground/35">
                ·
              </span>
            ) : null}
            <a
              href={`${TRANSPARENCY_EXPLORER_URL}/address/${item.contract}`}
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
