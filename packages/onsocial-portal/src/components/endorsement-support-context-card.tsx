'use client';

import { User } from 'lucide-react';
import { EndorsementSupportAction } from '@/components/endorsement-support-action';
import { EndorsementRecord } from '@/components/ui/endorsement-flow';
import { formatProfileCount } from '@/lib/profile-social-standings';
import { formatSupportBalanceLabel } from '@/lib/social-spend-profile';
import type {
  EndorsementSupportContext,
  EndorsementSupportPreviewSupporter,
  EndorsementSupportSubmitInput,
} from '@/lib/social-spend-endorsement';
import { cn } from '@/lib/utils';

function formatTotalSocial(yocto: string): string {
  try {
    return formatSupportBalanceLabel(BigInt(yocto));
  } catch {
    return '0';
  }
}

function PreviewAvatar({
  avatarUrl,
  className,
}: {
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-background bg-muted/30 text-muted-foreground',
        className
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <User className="h-2.5 w-2.5" strokeWidth={2} />
      )}
    </span>
  );
}

function SupporterPreviewStack({
  previewSupporters,
  supporterCount,
}: {
  previewSupporters: EndorsementSupportPreviewSupporter[];
  supporterCount: number;
}) {
  if (supporterCount <= 0 || previewSupporters.length === 0) return null;

  const overflowCount = Math.max(0, supporterCount - previewSupporters.length);

  return (
    <span className="inline-flex items-center" aria-hidden>
      {previewSupporters.map((supporter, index) => (
        <PreviewAvatar
          key={supporter.accountId}
          avatarUrl={supporter.avatarUrl}
          className={cn('h-5 w-5', index > 0 && '-ml-1.5')}
        />
      ))}
      {overflowCount > 0 ? (
        <span className="pl-1 portal-type-label font-medium tabular-nums text-muted-foreground/55">
          +{overflowCount}
        </span>
      ) : null}
    </span>
  );
}

export function EndorsementSupportContextCard({
  context,
  pageAccountId,
  pageLayout = true,
  viewerAccountId = null,
  onSupport,
  onSupportConfirmed,
  className,
}: {
  context: Pick<
    EndorsementSupportContext,
    | 'endorsementId'
    | 'issuer'
    | 'target'
    | 'topic'
    | 'note'
    | 'issuerName'
    | 'targetName'
    | 'issuerAvatarUrl'
    | 'targetAvatarUrl'
    | 'totalAmountYocto'
    | 'supporterCount'
    | 'previewSupporters'
  >;
  pageAccountId: string;
  pageLayout?: boolean;
  viewerAccountId?: string | null;
  onSupport?: (input: EndorsementSupportSubmitInput) => Promise<string[]>;
  onSupportConfirmed?: () => void;
  className?: string;
}) {
  const totalSocial = formatTotalSocial(context.totalAmountYocto);
  const hasSupportStats =
    context.supporterCount > 0 || context.totalAmountYocto !== '0';
  const hasParties = Boolean(context.issuer && context.target);
  const recipientDisplayName =
    context.targetName?.trim() || context.target || 'Endorsement';
  const showFooter = hasSupportStats || Boolean(onSupport);

  if (!hasParties) {
    return null;
  }

  return (
    <EndorsementRecord
      className={className}
      issuer={context.issuer}
      target={context.target}
      issuerName={context.issuerName}
      targetName={context.targetName}
      issuerAvatarUrl={context.issuerAvatarUrl}
      targetAvatarUrl={context.targetAvatarUrl}
      topic={context.topic}
      note={context.note}
      noteClamp={3}
      pageLayout={pageLayout}
      footerTrailing={
        showFooter ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-2 sm:justify-between">
            {hasSupportStats ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground/70">
                <span className="tabular-nums">
                  <span className="portal-type-lead font-semibold text-[var(--portal-green)]">
                    {totalSocial}
                  </span>
                  <span className="portal-type-caption font-medium text-muted-foreground/55">
                    {' '}
                    SOCIAL
                  </span>
                  <span className="portal-type-body-sm text-muted-foreground/45">
                    {' '}
                    ·{' '}
                  </span>
                  <span className="portal-type-body-sm tabular-nums">
                    {formatProfileCount(context.supporterCount)} supporter
                    {context.supporterCount === 1 ? '' : 's'}
                  </span>
                </span>
                <SupporterPreviewStack
                  previewSupporters={context.previewSupporters}
                  supporterCount={context.supporterCount}
                />
              </div>
            ) : null}
            {onSupport ? (
              <EndorsementSupportAction
                pageAccountId={pageAccountId}
                endorsementId={context.endorsementId}
                recipientAccountId={context.target}
                recipientDisplayName={recipientDisplayName}
                issuer={context.issuer}
                issuerName={context.issuerName}
                targetName={context.targetName}
                issuerAvatarUrl={context.issuerAvatarUrl}
                targetAvatarUrl={context.targetAvatarUrl}
                topic={context.topic}
                viewerAccountId={viewerAccountId}
                supporterCount={context.supporterCount}
                previewSupporters={context.previewSupporters}
                onSupport={onSupport}
                onSupportConfirmed={onSupportConfirmed}
                suppressSupportersPreview
              />
            ) : null}
          </div>
        ) : undefined
      }
    />
  );
}
