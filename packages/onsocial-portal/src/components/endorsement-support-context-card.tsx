'use client';

import { EndorsementContextStrip } from '@/components/ui/endorsement-flow';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { humanizeEndorsementTopic } from '@/lib/endorsements';
import { formatProfileCount } from '@/lib/profile-social-standings';
import { formatSupportBalanceLabel } from '@/lib/social-spend-profile';
import type { EndorsementSupportContext } from '@/lib/social-spend-endorsement';
import { cn } from '@/lib/utils';

function formatTotalSocial(yocto: string): string {
  try {
    return formatSupportBalanceLabel(BigInt(yocto));
  } catch {
    return '0';
  }
}

export function EndorsementSupportContextCard({
  context,
  pageLayout = true,
  className,
}: {
  context: Pick<
    EndorsementSupportContext,
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
  >;
  pageLayout?: boolean;
  className?: string;
}) {
  const topicLabel = humanizeEndorsementTopic(context.topic ?? undefined);
  const trimmedNote = context.note?.trim();
  const hasParties = Boolean(context.issuer && context.target);
  const totalSocial = formatTotalSocial(context.totalAmountYocto);
  const hasSupportStats =
    context.supporterCount > 0 || context.totalAmountYocto !== '0';

  return (
    <SurfacePanel
      radius="xl"
      tone="muted"
      padding="snug"
      className={cn('border border-border/45', className)}
    >
      {topicLabel ? (
        <h2 className="portal-type-lead font-medium text-[var(--portal-gold-text)]">
          {topicLabel}
        </h2>
      ) : (
        <h2 className="portal-type-lead font-medium text-foreground">
          Endorsement
        </h2>
      )}

      {trimmedNote ? (
        <blockquote className="mt-2 portal-type-body leading-relaxed text-muted-foreground line-clamp-3">
          &ldquo;{trimmedNote}&rdquo;
        </blockquote>
      ) : null}

      {hasParties ? (
        <EndorsementContextStrip
          issuer={context.issuer}
          target={context.target}
          issuerName={context.issuerName}
          targetName={context.targetName}
          issuerAvatarUrl={context.issuerAvatarUrl}
          targetAvatarUrl={context.targetAvatarUrl}
          pageLayout={pageLayout}
          className={trimmedNote ? 'mt-3' : 'mt-2.5'}
        />
      ) : null}

      {hasSupportStats ? (
        <p className="mt-3 portal-type-caption text-muted-foreground/70">
          <span className="font-semibold tabular-nums text-foreground/85">
            {totalSocial} SOCIAL
          </span>
          {' raised · '}
          <span className="tabular-nums">
            {formatProfileCount(context.supporterCount)} supporter
            {context.supporterCount === 1 ? '' : 's'}
          </span>
        </p>
      ) : null}
    </SurfacePanel>
  );
}
