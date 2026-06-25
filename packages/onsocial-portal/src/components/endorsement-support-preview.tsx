'use client';

import { User } from 'lucide-react';
import { ProtocolMotionArrow } from '@onsocial/ui';
import type { EndorsementSupportPreviewSupporter } from '@/lib/social-spend-endorsement';
import { cn } from '@/lib/utils';

function PreviewAvatar({
  avatarUrl,
  className,
}: {
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-background bg-muted/30 text-muted-foreground',
        className
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-2.5 w-2.5" strokeWidth={2} />
      )}
    </div>
  );
}

function formatOverflowCount(count: number): string {
  if (count >= 1000) {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(count);
  }
  return String(count);
}

export function EndorsementSupportPreview({
  previewSupporters,
  supporterCount,
  onClick,
  className,
}: {
  previewSupporters: EndorsementSupportPreviewSupporter[];
  supporterCount: number;
  onClick: () => void;
  className?: string;
}) {
  if (supporterCount <= 0) return null;

  const overflowCount = Math.max(0, supporterCount - previewSupporters.length);
  const controlClass = cn(
    'group/support inline-flex h-4 shrink-0 items-center gap-1 p-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border/60',
    className
  );

  return (
    <button
      type="button"
      className={controlClass}
      aria-label={`${supporterCount} supporter${supporterCount === 1 ? '' : 's'} — view list`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="inline-flex items-center">
        {previewSupporters.map((supporter, index) => (
          <PreviewAvatar
            key={supporter.accountId}
            avatarUrl={supporter.avatarUrl}
            className={cn('h-5 w-5', index > 0 && '-ml-1.5')}
          />
        ))}
        {overflowCount > 0 ? (
          <span className="pl-1 portal-type-label font-medium tabular-nums text-muted-foreground/55 transition-colors group-hover/support:text-muted-foreground/70">
            +{formatOverflowCount(overflowCount)}
          </span>
        ) : null}
      </span>
      <ProtocolMotionArrow
        static
        className="h-2.5 w-2.5 shrink-0 text-muted-foreground/55 transition-all duration-200 group-hover/support:translate-x-0.5 group-hover/support:-translate-y-0.5 group-hover/support:text-[var(--portal-green)] motion-reduce:transform-none"
      />
    </button>
  );
}
