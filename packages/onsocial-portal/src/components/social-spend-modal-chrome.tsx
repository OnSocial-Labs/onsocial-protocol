'use client';

import type { ReactNode } from 'react';
import { User } from 'lucide-react';
import { EndorsementContextStrip } from '@/components/ui/endorsement-flow';
import { ModalCloseButton } from '@/components/ui/modal-close-button';
import { cn } from '@/lib/utils';

export function SocialSpendModalHeader({
  titleId,
  eyebrow,
  title,
  children,
  closeAriaLabel,
  onClose,
  className,
}: {
  titleId: string;
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  closeAriaLabel: string;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative border-b border-fade-section px-4 pb-3 pt-3.5 md:px-5',
        className
      )}
    >
      <div className="min-w-0 pr-9">
        <p className="portal-eyebrow text-muted-foreground/55">{eyebrow}</p>
        <h2
          id={titleId}
          className="mt-0.5 truncate text-base font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        {children}
      </div>
      <div className="absolute right-3 top-3 z-10">
        <ModalCloseButton ariaLabel={closeAriaLabel} onClick={onClose} />
      </div>
    </div>
  );
}

export function SocialSpendEndorsementIdentity({
  issuer,
  target,
  issuerName,
  targetName,
  issuerAvatarUrl,
  targetAvatarUrl,
  viewerAccountId = null,
  className,
}: {
  issuer: string;
  target: string;
  issuerName?: string | null;
  targetName?: string | null;
  issuerAvatarUrl?: string | null;
  targetAvatarUrl?: string | null;
  viewerAccountId?: string | null;
  className?: string;
}) {
  return (
    <EndorsementContextStrip
      issuer={issuer}
      target={target}
      issuerName={issuerName}
      targetName={targetName}
      issuerAvatarUrl={issuerAvatarUrl}
      targetAvatarUrl={targetAvatarUrl}
      viewerAccountId={viewerAccountId}
      hideIssuerHandle
      className={cn('mt-2', className)}
    />
  );
}

export function SocialSpendProfileIdentity({
  displayName,
  avatarUrl,
  className,
}: {
  displayName: string;
  avatarUrl?: string | null;
  className?: string;
}) {
  return (
    <div className={cn('mt-2 flex min-w-0 items-center gap-2', className)}>
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full border border-background bg-muted/30 text-muted-foreground">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-3 w-3" strokeWidth={2} />
        )}
      </span>
      <span className="min-w-0 truncate portal-type-body-sm font-medium text-foreground/90">
        {displayName}
      </span>
    </div>
  );
}

export function SocialSpendRoutingCaption({
  recipientAccountId,
  recipientShareLabel,
  treasuryShareLabel,
  treasuryLabel = 'Protocol boost',
  className,
}: {
  recipientAccountId: string;
  recipientShareLabel: string;
  treasuryShareLabel: string;
  treasuryLabel?: string;
  className?: string;
}) {
  const accountLabel = recipientAccountId.trim();

  return (
    <p
      className={cn(
        'portal-type-micro leading-relaxed text-muted-foreground/50',
        className
      )}
    >
      <span className="tabular-nums text-muted-foreground/65">
        {recipientShareLabel}%
      </span>
      <span className="text-muted-foreground/35"> · </span>
      <span className="font-mono text-muted-foreground/60">{accountLabel}</span>
      <span className="text-muted-foreground/35"> · </span>
      <span className="tabular-nums text-muted-foreground/65">
        {treasuryShareLabel}%
      </span>
      <span className="text-muted-foreground/35"> · </span>
      <span>{treasuryLabel}</span>
    </p>
  );
}
