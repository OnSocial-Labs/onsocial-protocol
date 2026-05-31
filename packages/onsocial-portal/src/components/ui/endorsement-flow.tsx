import type { ReactNode } from 'react';
import { cleanHandle, humanizeEndorsementTopic } from '@/lib/endorsements';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import { cn } from '@/lib/utils';

/** Subtle gold hairline between quote and attribution. */
const endorsementRecordDividerClass =
  'h-px w-full bg-[var(--portal-gold)]/22';

/** Row shell — unified hover across topic, quote, attribution, and profile chips. */
export const endorsementListRowClass =
  'group flex w-full cursor-pointer flex-col rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--portal-neutral-bg)] focus-visible:bg-[var(--portal-neutral-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]';

export function endorsementPartyName(
  accountId: string,
  name?: string | null,
  viewerAccountId?: string | null
): string {
  if (viewerAccountId && accountId === viewerAccountId) return 'You';
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return cleanHandle(accountId);
}

export function endorsementPartyAt(
  accountId: string,
  viewerAccountId?: string | null
): string {
  if (viewerAccountId && accountId === viewerAccountId) return 'you';
  return `@${accountId}`;
}

/** Accessible summary: `Alice (@alice) to Bob (@bob)`. */
export function endorsementFlowSummary(
  issuer: string,
  target: string,
  issuerName?: string | null,
  targetName?: string | null,
  viewerAccountId?: string | null
): string {
  const issuerLabel = endorsementPartyName(issuer, issuerName, viewerAccountId);
  const targetLabel = endorsementPartyName(target, targetName, viewerAccountId);
  const issuerAt = endorsementPartyAt(issuer, viewerAccountId);
  const targetAt = endorsementPartyAt(target, viewerAccountId);
  return `${issuerLabel} (${issuerAt}) endorsed ${targetLabel} (${targetAt})`;
}

function partyHasDistinctName(
  accountId: string,
  name?: string | null
): boolean {
  if (!accountId) return false;
  const trimmed = name?.trim();
  if (!trimmed) return false;
  const handle = cleanHandle(accountId);
  return trimmed !== handle && trimmed !== `@${handle}` && trimmed !== accountId;
}

function partyInitial(
  accountId: string,
  name?: string | null,
  labelOverride?: string
): string {
  if (labelOverride) return labelOverride.slice(0, 1).toUpperCase() || '?';
  const trimmed = name?.trim();
  if (trimmed) return trimmed.slice(0, 1).toUpperCase() || '?';
  if (accountId) {
    return cleanHandle(accountId).slice(0, 1).toUpperCase() || '?';
  }
  return '?';
}

function EndorsementFlowMiniAvatar({
  avatarUrl,
  initial,
  active,
  interactive = false,
}: {
  avatarUrl?: string | null;
  initial: string;
  active?: boolean;
  interactive?: boolean;
}) {
  const hoverRingClass = interactive
    ? 'transition-shadow group-hover/chip:ring-1 group-hover/chip:ring-foreground/15'
    : null;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn(
          'h-5 w-5 shrink-0 rounded-full border object-cover',
          active
            ? 'border-[var(--portal-gold-border)]'
            : 'border-border/40',
          hoverRingClass
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border portal-type-micro font-semibold',
        active
          ? 'border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] text-[var(--portal-gold)]'
          : 'border-border/40 bg-muted/20 text-muted-foreground/70',
        hoverRingClass
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function EndorsementPartyChip({
  accountId,
  name,
  viewerAccountId,
  avatarUrl,
  labelOverride,
  hideHandle = false,
  onSelectAccount,
  className,
}: {
  accountId: string;
  name?: string | null;
  viewerAccountId?: string | null;
  avatarUrl?: string | null;
  labelOverride?: string;
  hideHandle?: boolean;
  onSelectAccount?: (accountId: string) => void;
  className?: string;
}) {
  const isViewer = Boolean(
    viewerAccountId && accountId && accountId === viewerAccountId
  );
  const handle = accountId ? `@${accountId}` : null;
  const hasDistinctName = partyHasDistinctName(accountId, name);
  const isInteractive = Boolean(onSelectAccount && accountId);

  const label = labelOverride
    ? labelOverride
    : isViewer
      ? 'You'
      : hasDistinctName
        ? name!.trim()
        : (handle ?? 'Unknown');

  const showNameLine = Boolean(labelOverride || isViewer || hasDistinctName);
  const showHandle = !hideHandle && handle;

  const handleLine = showHandle ? (
    <PortalHoverTooltip
      className={cn(
        'block min-w-0 truncate portal-type-caption tabular-nums transition-colors',
        showNameLine
          ? 'text-muted-foreground/45'
          : 'portal-type-body-sm font-medium text-foreground/75',
        isViewer && showNameLine && 'text-[var(--portal-gold)]/55',
        isInteractive &&
          (isViewer && showNameLine
            ? 'group-hover/chip:text-[var(--portal-gold)]/70'
            : 'group-hover/chip:text-muted-foreground/55')
      )}
      aria-label={`Account ${accountId}`}
      stopPropagation={false}
      tabIndex={isInteractive ? undefined : 0}
      tooltip={accountId}
    >
      {handle}
    </PortalHoverTooltip>
  ) : null;

  const content = (
    <>
      <EndorsementFlowMiniAvatar
        avatarUrl={avatarUrl}
        initial={partyInitial(accountId, name, labelOverride)}
        active={isViewer}
        interactive={isInteractive}
      />
      <span className="flex min-w-0 flex-col gap-px leading-tight">
        {showNameLine ? (
          <span
            className={cn(
              'truncate portal-type-body-sm font-medium transition-colors',
              isViewer
                ? 'text-[var(--portal-gold)] group-hover/chip:text-[var(--portal-gold)]'
                : 'text-foreground/85 group-hover/chip:text-foreground'
            )}
          >
            {label}
          </span>
        ) : null}
        {handleLine}
      </span>
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelectAccount?.(accountId);
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        aria-label={`Open profile for ${accountId}`}
        className={cn(
          'group/chip inline-flex min-w-0 items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]',
          className
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        className
      )}
    >
      {content}
    </span>
  );
}

function EndorsementFlowAttribution({
  issuer,
  target,
  issuerName,
  targetName,
  issuerAvatarUrl,
  targetAvatarUrl,
  viewerAccountId,
  issuerLabelOverride,
  hideIssuerHandle = false,
  onSelectAccount,
  className,
}: {
  issuer: string;
  target: string;
  issuerName?: string | null;
  targetName?: string | null;
  issuerAvatarUrl?: string | null;
  targetAvatarUrl?: string | null;
  viewerAccountId?: string | null;
  issuerLabelOverride?: string;
  hideIssuerHandle?: boolean;
  onSelectAccount?: (accountId: string) => void;
  className?: string;
}) {
  const ariaLabel = endorsementFlowSummary(
    issuer,
    target,
    issuerLabelOverride ? issuerLabelOverride : issuerName,
    targetName,
    viewerAccountId
  );

  return (
    <>
      <div className={endorsementRecordDividerClass} aria-hidden="true" />
      <div
        className={cn('flex min-w-0 items-center gap-1 pt-2', className)}
        aria-label={ariaLabel}
      >
        <EndorsementPartyChip
          accountId={issuer}
          name={issuerName}
          viewerAccountId={viewerAccountId}
          avatarUrl={issuerAvatarUrl}
          labelOverride={issuerLabelOverride}
          hideHandle={hideIssuerHandle}
          onSelectAccount={onSelectAccount}
          className="min-w-0 flex-1"
        />
        <ProtocolMotionArrow className="mx-0.5 h-3 w-3 shrink-0 text-[var(--portal-gold)]/75" />
        <EndorsementPartyChip
          accountId={target}
          name={targetName}
          viewerAccountId={viewerAccountId}
          avatarUrl={targetAvatarUrl}
          onSelectAccount={onSelectAccount}
          className="min-w-0 flex-1"
        />
      </div>
    </>
  );
}

/** Content-first endorsement card — topic + quote lead, attribution follows. */
export function EndorsementRecord({
  issuer,
  target,
  issuerName,
  targetName,
  issuerAvatarUrl,
  targetAvatarUrl,
  viewerAccountId,
  topic,
  note,
  timeLabel,
  trailing,
  issuerLabelOverride,
  hideIssuerHandle = false,
  noteClamp,
  onSelectAccount,
  className,
}: {
  issuer: string;
  target: string;
  issuerName?: string | null;
  targetName?: string | null;
  issuerAvatarUrl?: string | null;
  targetAvatarUrl?: string | null;
  viewerAccountId?: string | null;
  topic?: string | null;
  note?: string | null;
  timeLabel?: ReactNode;
  trailing?: ReactNode;
  issuerLabelOverride?: string;
  hideIssuerHandle?: boolean;
  /** Clamp note lines in compact list surfaces. */
  noteClamp?: 2 | 3;
  onSelectAccount?: (accountId: string) => void;
  className?: string;
}) {
  const topicLabel = topic?.trim()
    ? humanizeEndorsementTopic(topic)
    : null;
  const trimmedNote = note?.trim();

  return (
    <article className={cn('relative min-w-0 pl-2.5', className)}>
      <span
        aria-hidden="true"
        className="absolute bottom-1 left-0 top-1 w-px rounded-full bg-[var(--portal-gold)]/45"
      />

      <div className="flex items-start justify-between gap-2">
        {topicLabel ? (
          <h4 className="min-w-0 truncate portal-type-lead font-medium text-[var(--portal-gold-text)]">
            {topicLabel}
          </h4>
        ) : (
          <span className="portal-type-body-sm text-muted-foreground/50">
            Endorsement
          </span>
        )}

        {(timeLabel || trailing) && (
          <div className="flex shrink-0 items-center gap-1.5">
            {timeLabel}
            {trailing}
          </div>
        )}
      </div>

      {trimmedNote ? (
        <blockquote
          className={cn(
            'mt-1.5 portal-type-body leading-relaxed text-muted-foreground/75',
            noteClamp === 2 && 'line-clamp-2',
            noteClamp === 3 && 'line-clamp-3'
          )}
        >
          &ldquo;{trimmedNote}&rdquo;
        </blockquote>
      ) : null}

      <EndorsementFlowAttribution
        issuer={issuer}
        target={target}
        issuerName={issuerName}
        targetName={targetName}
        issuerAvatarUrl={issuerAvatarUrl}
        targetAvatarUrl={targetAvatarUrl}
        viewerAccountId={viewerAccountId}
        issuerLabelOverride={issuerLabelOverride}
        hideIssuerHandle={hideIssuerHandle}
        onSelectAccount={onSelectAccount}
        className={!trimmedNote ? 'mt-2' : undefined}
      />
    </article>
  );
}

/** @deprecated Use EndorsementRecord. */
export function EndorsementFlowHeader(
  props: Parameters<typeof EndorsementRecord>[0]
) {
  return <EndorsementRecord {...props} />;
}
