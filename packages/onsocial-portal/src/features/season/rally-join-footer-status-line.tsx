import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';
import {
  RALLY_LINE_BOX_JOIN_CONTEXT,
  RALLY_LINE_BOX_JOIN_FLOW_LABEL,
  RALLY_LINE_BOX_JOIN_SHORTFALL,
  RALLY_LINE_BOX_STRIP,
  SEASON_COLLECT_ACTION_ROW_CLASS,
  SEASON_COLLECT_BUTTON_MIN_CLASS,
  SEASON_PANEL_PADDING_CLASS,
  SEASON_RALLY_JOIN_GET_SOCIAL_ROW_CLASS,
  SEASON_RALLY_JOIN_META_STACK_CLASS,
  SEASON_RALLY_JOIN_SPLIT_STACK_CLASS,
} from '@/features/season/season-page-column';
import { RallyTextSlot } from '@/features/season/rally-text-slot';
import {
  joinBpsToPercentLabel,
  type JoinSpendSplitPart,
} from '@/lib/join-rally-routing';
import { RALLY_JOIN_SPLIT_EYEBROW } from '@/lib/rally-join-copy';
import { getPortalDiscoverUrl } from '@/lib/portal-config';
import { PORTAL_SWAP_ENABLED } from '@/lib/portal-swap-config';
import { cn } from '@/lib/utils';

const JOIN_SHORTFALL_PULSE_CLASS = 'h-[1em] w-36 max-w-full';
const JOIN_GET_SOCIAL_PULSE_CLASS = 'h-[1em] w-24 max-w-full';
const JOIN_SPEND_SPLIT_PULSE_CLASS = 'h-[1em] w-32 max-w-full';
const JOIN_CONTEXT_PULSE_CLASS = 'h-[1em] w-48 max-w-full';
const JOIN_SPLIT_EYEBROW_PULSE_CLASS = 'h-[1em] w-28 max-w-full';

function JoinSpendStripDot() {
  return <span className="text-muted-foreground/35"> · </span>;
}

function RallyJoinSpendSplitStrip({
  parts = null,
  loading = false,
  className,
}: {
  parts?: JoinSpendSplitPart[] | null;
  loading?: boolean;
  className?: string;
}) {
  return (
    <RallyTextSlot
      lineClass={cn(RALLY_LINE_BOX_STRIP, 'text-muted-foreground/70', className)}
      loading={loading}
      pulseClass={JOIN_SPEND_SPLIT_PULSE_CLASS}
    >
      {parts?.map((part, index) => (
        <span key={`${part.label}-${index}`}>
          {index > 0 ? <JoinSpendStripDot /> : null}
          <span
            className={cn(
              'whitespace-nowrap',
              part.accent === 'blue' ? 'portal-blue-text' : undefined
            )}
          >
            <span className="font-mono tabular-nums">
              {joinBpsToPercentLabel(part.bps)}%
            </span>
            <span className="ml-1">{part.label}</span>
          </span>
        </span>
      ))}
    </RallyTextSlot>
  );
}

/** Per-entry split — routing % for the join CTA (hero shows entry cost + pool totals). */
export function RallyJoinEntrySplitBlock({
  parts = null,
  loading = false,
  className,
}: {
  entryLabel?: string | null;
  entryInHero?: boolean;
  parts?: JoinSpendSplitPart[] | null;
  loading?: boolean;
  className?: string;
}) {
  if (!loading && !parts?.length) {
    return null;
  }

  return (
    <div className={cn('w-full', SEASON_RALLY_JOIN_SPLIT_STACK_CLASS, className)}>
      <RallyTextSlot
        lineClass={RALLY_LINE_BOX_JOIN_FLOW_LABEL}
        loading={loading}
        pulseClass={JOIN_SPLIT_EYEBROW_PULSE_CLASS}
      >
        {RALLY_JOIN_SPLIT_EYEBROW}
      </RallyTextSlot>
      <RallyJoinSpendSplitStrip parts={parts} loading={loading} />
    </div>
  );
}

/** Standing guide — sits below the split in the upper join zone. */
export function RallyJoinContextHint({
  children,
  loading = false,
  className,
}: {
  children?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <RallyTextSlot
      lineClass={cn(RALLY_LINE_BOX_JOIN_CONTEXT, className)}
      loading={loading}
      pulseClass={JOIN_CONTEXT_PULSE_CLASS}
    >
      {children}
    </RallyTextSlot>
  );
}

/** Shortfall when balance blocks join — shown above the disabled CTA. */
export function RallyJoinFooterShortfallLine({
  children,
  loading = false,
  className,
}: {
  children?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <RallyTextSlot
      lineClass={cn(RALLY_LINE_BOX_JOIN_SHORTFALL, className)}
      loading={loading}
      pulseClass={JOIN_SHORTFALL_PULSE_CLASS}
    >
      {children ? <span className="portal-gold-text">{children}</span> : null}
    </RallyTextSlot>
  );
}

function RallyMicroActionLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <RallyTextSlot
      lineClass={cn(SEASON_RALLY_JOIN_GET_SOCIAL_ROW_CLASS, className)}
      pulseClass={JOIN_GET_SOCIAL_PULSE_CLASS}
    >
      <Link
        href={href}
        className="portal-action-link group inline-flex items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        <ProtocolMotionArrow className="h-3 w-3" />
      </Link>
    </RallyTextSlot>
  );
}

export function RallyGetSocialLink({
  className,
}: {
  className?: string;
}) {
  const label = PORTAL_SWAP_ENABLED ? 'Get SOCIAL' : 'How to get SOCIAL';

  return <RallyMicroActionLink href="/swap" label={label} className={className} />;
}

export function RallyDiscoverProfilesLink({
  className,
}: {
  className?: string;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant="default"
      className={cn('min-w-[10rem] justify-center', className)}
    >
      <Link
        href={getPortalDiscoverUrl()}
        className="inline-flex items-center gap-1.5"
      >
        Discover profiles
        <ProtocolMotionArrow className="h-3 w-3" />
      </Link>
    </Button>
  );
}

/** Upper join zone — split + standing hint (mirrors standing summary padding). */
export function RallyJoinContextBlock({
  joinSpendSplitParts = null,
  joinSpendSplitLoading = false,
  joinEntryLabel = null,
  entryInHero = false,
  contextHint = null,
  contextHintLoading = false,
  reserveLayout = false,
  className,
}: {
  joinSpendSplitParts?: JoinSpendSplitPart[] | null;
  joinSpendSplitLoading?: boolean;
  joinEntryLabel?: string | null;
  entryInHero?: boolean;
  contextHint?: string | null;
  contextHintLoading?: boolean;
  /** Keep live/upcoming join footer height aligned when content is still loading. */
  reserveLayout?: boolean;
  className?: string;
}) {
  const showEntrySplit =
    joinSpendSplitLoading || Boolean(joinSpendSplitParts?.length);
  const showContextHint =
    contextHintLoading || Boolean(contextHint?.trim());

  if (!reserveLayout && !showEntrySplit && !showContextHint) {
    return <div className={cn(SEASON_PANEL_PADDING_CLASS, 'pb-0', className)} aria-hidden />;
  }

  return (
    <div className={cn(SEASON_PANEL_PADDING_CLASS, 'pb-0', className)}>
      <div className={SEASON_RALLY_JOIN_META_STACK_CLASS}>
        {showEntrySplit ? (
          <RallyJoinEntrySplitBlock
            entryLabel={joinEntryLabel}
            entryInHero={entryInHero}
            parts={joinSpendSplitParts}
            loading={joinSpendSplitLoading}
          />
        ) : reserveLayout ? (
          <RallyJoinEntrySplitBlock loading />
        ) : null}
        {showContextHint ? (
          <RallyJoinContextHint loading={contextHintLoading && !contextHint}>
            {contextHint}
          </RallyJoinContextHint>
        ) : reserveLayout ? (
          <RallyJoinContextHint loading={contextHintLoading} />
        ) : null}
      </div>
    </div>
  );
}

/** Join CTA — same bottom slot and min-height as Collect. */
export function RallyJoinActionSection({
  shortfallLabel = null,
  shortfallLoading = false,
  showGetSocial = false,
  action,
  compact = false,
  className,
}: {
  shortfallLabel?: string | null;
  shortfallLoading?: boolean;
  showGetSocial?: boolean;
  action: ReactNode;
  /** Homepage promo — tighter padding, no collect-slot min-height. */
  compact?: boolean;
  className?: string;
}) {
  const showShortfallLine =
    shortfallLoading || Boolean(shortfallLabel?.trim());

  return (
    <div
      className={cn(
        'flex w-full flex-col items-center text-center',
        compact
          ? 'px-3 py-2.5 md:px-4 md:py-3'
          : cn(
              'mt-2 px-3.5 pb-3.5 md:px-4 md:pb-4',
              SEASON_COLLECT_BUTTON_MIN_CLASS
            ),
        className
      )}
    >
      {showShortfallLine ? (
        <RallyJoinFooterShortfallLine
          loading={shortfallLoading && !shortfallLabel}
          className="mb-1.5"
        >
          {shortfallLabel}
        </RallyJoinFooterShortfallLine>
      ) : null}
      <div
        className={cn(
          'flex w-full items-center justify-center',
          SEASON_COLLECT_ACTION_ROW_CLASS
        )}
      >
        {action}
      </div>
      {showGetSocial ? <RallyGetSocialLink className="mt-1.5" /> : null}
    </div>
  );
}

/** @deprecated Compose {@link RallyJoinContextBlock} + {@link RallyJoinActionSection}. */
export function RallyJoinActionZone({
  joinSpendSplitParts = null,
  joinSpendSplitLoading = false,
  joinEntryLabel = null,
  entryInHero = false,
  contextHint = null,
  contextHintLoading = false,
  shortfallLabel = null,
  showGetSocial = false,
  shortfallLoading = false,
  action,
  className,
}: {
  joinSpendSplitParts?: JoinSpendSplitPart[] | null;
  joinSpendSplitLoading?: boolean;
  joinEntryLabel?: string | null;
  entryInHero?: boolean;
  contextHint?: string | null;
  contextHintLoading?: boolean;
  shortfallLabel?: string | null;
  showGetSocial?: boolean;
  shortfallLoading?: boolean;
  action: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex w-full flex-col', className)}>
      <RallyJoinContextBlock
        joinSpendSplitParts={joinSpendSplitParts}
        joinSpendSplitLoading={joinSpendSplitLoading}
        joinEntryLabel={joinEntryLabel}
        entryInHero={entryInHero}
        contextHint={contextHint}
        contextHintLoading={contextHintLoading}
      />
      <RallyJoinActionSection
        shortfallLabel={shortfallLabel}
        shortfallLoading={shortfallLoading}
        showGetSocial={showGetSocial}
        action={action}
      />
    </div>
  );
}

export {
  JOIN_CONTEXT_PULSE_CLASS,
  JOIN_GET_SOCIAL_PULSE_CLASS,
  JOIN_SHORTFALL_PULSE_CLASS,
  JOIN_SPEND_SPLIT_PULSE_CLASS,
  JOIN_SPLIT_EYEBROW_PULSE_CLASS,
  RallyJoinSpendSplitStrip,
};
