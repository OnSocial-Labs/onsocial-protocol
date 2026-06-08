import { cn } from '@/lib/utils';

/** Horizontal protocol flow line — green peak at center, like the homepage hero underline. */
export function ProtocolFlowDivider({
  active = false,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn('relative h-px w-full', className)}>
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          active ? 'opacity-80' : 'opacity-55'
        )}
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(107,114,128,0.14) 12%, rgba(96,165,250,0.22) 46%, rgba(74,222,128,0.28) 50%, rgba(74,222,128,0.28) 54%, rgba(107,114,128,0.14) 88%, transparent 100%)',
        }}
      />
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          active ? 'opacity-40' : 'opacity-25'
        )}
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.16) 30%, rgba(255,255,255,0.34) 50%, rgba(255,255,255,0.16) 70%, transparent 100%)',
        }}
      />
    </div>
  );
}
