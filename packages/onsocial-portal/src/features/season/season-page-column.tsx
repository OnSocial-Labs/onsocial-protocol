import type { ReactNode } from 'react';
import type { SeasonPhase } from '@/lib/season-registry';
import type { SeasonZeroLifecyclePhase } from '@/features/season/season-zero-types';
import { cn } from '@/lib/utils';

/** Shared centered column for season rally pages (desktop + mobile). */
export const SEASON_PAGE_COLUMN_CLASS = 'mx-auto w-full max-w-xl';

export const SEASON_PANEL_PADDING_CLASS = 'p-3.5 md:p-4';

/** Horizontal + vertical padding for metrics pulse (matches panel gutters). */
export const SEASON_RALLY_METRICS_PAD_CLASS =
  'px-3.5 py-2.5 md:px-4 md:py-3';

/**
 * Divider between major panel zones (e.g. standings list sections).
 * Personal standing + reward flows without a divider — spacing only.
 */
export const SEASON_PANEL_DIVIDER_CLASS =
  'mt-3 border-t border-fade-detail pt-3';

/** Metrics rail value row — stable height on load/refresh. */
export const SEASON_PULSE_VALUE_ROW_CLASS =
  'mt-0.5 flex min-h-5 items-center justify-center';

/** Shared line boxes — skeleton + loaded text use identical wrappers. */
export const RALLY_LINE_BOX_MICRO =
  'flex min-h-3 w-full items-center justify-center leading-none portal-type-micro';

export const RALLY_LINE_BOX_EYEBROW =
  'inline-flex min-h-[0.84375rem] shrink-0 items-center leading-none portal-eyebrow-wide';

export const RALLY_LINE_BOX_CAPTION =
  'flex min-h-3.5 w-full items-center leading-none portal-type-caption';

export const RALLY_LINE_BOX_LEAD =
  'flex min-h-[1.3125rem] w-full items-center leading-none portal-type-lead md:min-h-6';

export const RALLY_LINE_BOX_SCORE =
  'flex min-h-5 w-full items-center justify-end leading-none font-mono text-sm font-semibold tabular-nums tracking-tight';

export const RALLY_LINE_BOX_STRIP =
  'flex min-h-3 w-full items-center justify-center leading-none text-center text-[10px] font-medium uppercase tracking-[0.12em] sm:text-[11px]';

/** Join SOCIAL flow label — eyebrow above per-entry split. */
export const RALLY_LINE_BOX_JOIN_FLOW_LABEL =
  'inline-flex min-h-3 w-full min-w-0 items-center justify-center text-center portal-eyebrow-wide leading-none text-muted-foreground/60';

/** Prospective payout / standing context above join CTA. */
export const RALLY_LINE_BOX_JOIN_CONTEXT =
  'flex min-h-4 w-full min-w-0 items-center justify-center text-center portal-type-micro leading-snug text-muted-foreground/70';

/** Shortfall line above disabled join CTA. */
export const RALLY_LINE_BOX_JOIN_SHORTFALL =
  'inline-flex min-h-4 w-full min-w-0 items-center justify-center text-center text-xs leading-4';

/** Get SOCIAL link row below join CTA. */
export const SEASON_RALLY_JOIN_GET_SOCIAL_ROW_CLASS =
  'inline-flex min-h-4 w-full min-w-0 items-center justify-center text-center portal-type-micro leading-snug';

/** @deprecated Join footer uses {@link resolveRallyJoinedFooterMinClass} on the frame. */
export const SEASON_RALLY_JOIN_FOOTER_FRAME_CLASS = cn(
  'w-full',
  SEASON_PANEL_PADDING_CLASS
);

export const RALLY_LINE_BOX_COLLECTED =
  'flex min-h-9 w-full items-center justify-center leading-none font-mono text-sm font-semibold tabular-nums sm:text-base';

/** Pulse rail column divider — matches `SeasonRallyPulse`. */
export const SEASON_RALLY_PULSE_DIVIDER_CLASS =
  'hidden h-4 w-px shrink-0 bg-border/50 sm:block';

/** Skeleton pulses aligned to loaded metrics rail typography. */
export const SEASON_PULSE_LABEL_SKELETON_CLASS =
  'h-[0.75rem] w-10 rounded-full bg-foreground/[0.06]';

export const SEASON_PULSE_VALUE_SKELETON_CLASS =
  'h-3.5 w-14 rounded-full bg-foreground/[0.06]';

/** Breakdown strip lines — `STRIP_LINE_CLASS` (10–11px). */
export const SEASON_RALLY_BREAKDOWN_LINE_SKELETON_CLASS =
  'mx-auto h-3 w-36 max-w-full rounded-full bg-foreground/[0.06]';

export const SEASON_RALLY_BREAKDOWN_LINE_SKELETON_SECONDARY_CLASS =
  'mx-auto h-3 w-28 max-w-full rounded-full bg-foreground/[0.05]';

/** Standing row skeleton pulses — match loaded type scale. */
export const SEASON_STANDING_NAME_SKELETON_CLASS =
  'h-[0.875rem] w-36 max-w-full rounded-full bg-foreground/[0.06]';

export const SEASON_STANDING_PTS_SKELETON_CLASS =
  'ml-auto h-3.5 w-14 rounded-full bg-foreground/[0.06]';

export const SEASON_STANDING_SIGNAL_SKELETON_CLASS =
  'h-[0.625rem] w-full max-w-[14rem] rounded-full bg-foreground/[0.06]';

export const SEASON_STANDING_MIX_SKELETON_CLASS =
  'h-[0.625rem] w-36 max-w-full rounded-full bg-foreground/[0.06]';

export const SEASON_STANDING_MIX_BAR_SKELETON_CLASS =
  'bg-foreground/[0.04]';

/** Collect CTA only — reward amount lives in the standing row. */
export const SEASON_COLLECT_BUTTON_MIN_CLASS = 'min-h-[3.25rem]';

/** Room for chip float + sweep above the Collect button (Boost-aligned). */
export const SEASON_COLLECT_CELEBRATION_STAGE_CLASS = 'min-h-[6.5rem]';

/** Rally collect action — chip float + button only (amount lives in standing row). */
export const SEASON_COLLECT_RALLY_ACTION_MIN_CLASS = 'min-h-[5rem]';

/** @deprecated Use {@link SEASON_COLLECT_RALLY_ACTION_MIN_CLASS} on {@link RallyJoinActionSection}. */
export const SEASON_RALLY_JOIN_ACTION_MIN_CLASS = 'min-h-[5.75rem]';

/** @deprecated Join button uses Collect-aligned bottom slot. */
export const SEASON_RALLY_JOIN_CTA_GAP_CLASS = 'mt-3';

/** Split eyebrow + % strip — one tight unit. */
export const SEASON_RALLY_JOIN_SPLIT_STACK_CLASS = 'space-y-0.5';

/** Copy block above join CTA — split, hint, shortfall. */
export const SEASON_RALLY_JOIN_META_STACK_CLASS =
  'flex w-full flex-col items-center gap-1.5';

/** @deprecated Join footer uses {@link SEASON_COLLECT_RALLY_ACTION_MIN_CLASS} on the action zone. */
export const SEASON_RALLY_FOOTER_MIN_CLASS = SEASON_COLLECT_RALLY_ACTION_MIN_CLASS;

export const SEASON_COLLECT_AMOUNT_ROW_CLASS = 'min-h-9 sm:min-h-10';
export const SEASON_COLLECT_ACTION_ROW_CLASS = 'min-h-9';

/** Collected line + optional transaction link without footer jump. */
export const SEASON_COLLECT_COLLECTED_MIN_CLASS = 'min-h-[4.5rem]';

/** Collected status only — reward already shown in the standing row. */
export const SEASON_COLLECT_COLLECTED_SLIM_MIN_CLASS = 'min-h-[3.25rem]';

/** Collected status line skeleton — matches `text-sm sm:text-base` mono. */
export const SEASON_COLLECT_COLLECTED_SKELETON_CLASS =
  'h-5 w-[5.5rem] rounded-full bg-foreground/[0.06] sm:h-[1.125rem] sm:w-[6rem]';

export const SEASON_COLLECT_TX_LINK_ROW_CLASS = 'min-h-4';

/** Standings header meta line — participant count. */
export const SEASON_STANDINGS_META_ROW_CLASS = 'mt-0.5 min-h-3.5';

/** Skeleton width aligned to typical "9 of 9" meta copy. */
export const SEASON_STANDINGS_META_SKELETON_CLASS = 'h-3.5 w-[4.75rem]';

/** Rules pill slot in standings header rail. */
export const SEASON_STANDINGS_RULES_SLOT_CLASS = 'h-7 w-14 shrink-0';

/** Personal zone spacing below standing hint row. */
export const SEASON_PERSONAL_REWARD_PAD_CLASS =
  'mt-3 px-3.5 pb-3.5 md:px-4 md:pb-4';

/** Hero card shell — header + metrics breakdown + joined standing + collect/collected. */
export const SEASON_RALLY_HERO_CARD_MIN_CLASS =
  'min-h-[23rem] sm:min-h-[23.5rem]';

/** Hero card when join CTA is shown — tighter than joined celebration shell. */
export const SEASON_RALLY_HERO_CARD_JOIN_MIN_CLASS =
  'min-h-[16rem] sm:min-h-[16.5rem]';

/** Hero card with metrics rail only — user not in rally (post-live browse). */
export const SEASON_RALLY_HERO_CARD_METRICS_MIN_CLASS =
  'min-h-[9rem] sm:min-h-[9.5rem]';

export type RallyHeroFooterPreview = 'joined' | 'join' | 'connect' | 'none';

export function resolveRallyHeroCardMinClass(
  footerPreview: RallyHeroFooterPreview
): string {
  switch (footerPreview) {
    case 'joined':
      return SEASON_RALLY_HERO_CARD_MIN_CLASS;
    case 'join':
      return SEASON_RALLY_HERO_CARD_JOIN_MIN_CLASS;
    case 'connect':
      return 'min-h-[18rem] sm:min-h-[18.5rem]';
    case 'none':
      return SEASON_RALLY_HERO_CARD_METRICS_MIN_CLASS;
  }
}

/** Metrics breakdown strip under the pulse rail (loaded layout). */
export const SEASON_RALLY_METRICS_BREAKDOWN_CLASS = 'mt-2 space-y-1';

/** Pre-join footer — split hint + CTA (smaller than joined standing + collect). */
export const SEASON_RALLY_JOIN_FOOTER_MIN_CLASS = 'min-h-[10.5rem]';

/** Joined footer — standing row + collect button (celebration stage). */
export const SEASON_RALLY_JOINED_FOOTER_ACTION_MIN_CLASS = 'min-h-[16.5rem]';

/** Joined footer — standing row + collected status (no button). */
export const SEASON_RALLY_JOINED_FOOTER_COLLECTED_MIN_CLASS = 'min-h-[15rem]';

/** @deprecated Use action or collected variant. */
export const SEASON_RALLY_JOINED_FOOTER_MIN_CLASS =
  SEASON_RALLY_JOINED_FOOTER_ACTION_MIN_CLASS;

export function resolveCollectedZoneMinClass({
  statusHref = null,
  reserveTxLink = false,
}: {
  rewardShownInStanding?: boolean;
  statusHref?: string | null;
  reserveTxLink?: boolean;
} = {}): string {
  const showTxLink = Boolean(statusHref) || reserveTxLink;

  return showTxLink
    ? SEASON_COLLECT_COLLECTED_MIN_CLASS
    : SEASON_COLLECT_COLLECTED_SLIM_MIN_CLASS;
}

export function resolveRallyJoinFooterMinClass(): string {
  return SEASON_RALLY_JOIN_FOOTER_MIN_CLASS;
}

export function resolveRallyJoinedFooterMinClass(
  collectPreview: 'button' | 'collected'
): string {
  return collectPreview === 'button'
    ? SEASON_RALLY_JOINED_FOOTER_ACTION_MIN_CLASS
    : SEASON_RALLY_JOINED_FOOTER_COLLECTED_MIN_CLASS;
}

/** Standings list — reserved height while loading (matches row shell). */
export const SEASON_STANDINGS_LIST_MIN_CLASS = 'min-h-[34.375rem]';

export const SEASON_STANDINGS_SKELETON_MAX_ROWS = 5;

/** Loaded row shell — avatar rail + head row + detail block + row padding. */
export const SEASON_STANDING_ROW_SHELL_MIN_CLASS = 'min-h-[6.875rem]';

/** Name line — matches portal-type-lead line box (0.875rem × 1.5). */
export const SEASON_STANDING_NAME_ROW_CLASS =
  'min-h-[1.3125rem] md:min-h-6';

/** Head row when pts + reward stack is reserved. */
export const SEASON_STANDING_HEAD_ROW_WITH_REWARD_CLASS = 'min-h-[2.125rem]';

export function resolveStandingHeadRowMinClass(
  reserveRewardSlot: boolean
): string {
  return reserveRewardSlot
    ? SEASON_STANDING_HEAD_ROW_WITH_REWARD_CLASS
    : SEASON_STANDING_NAME_ROW_CLASS;
}

const STANDINGS_LIST_MIN_BY_ROW_COUNT: Record<number, string> = {
  1: 'min-h-[6.875rem]',
  2: 'min-h-[13.75rem]',
  3: 'min-h-[20.625rem]',
  4: 'min-h-[27.5rem]',
  5: 'min-h-[34.375rem]',
};

export function resolveStandingsSkeletonRowCount(total: number): number {
  if (total <= 0) {
    return SEASON_STANDINGS_SKELETON_MAX_ROWS;
  }

  return Math.min(SEASON_STANDINGS_SKELETON_MAX_ROWS, total);
}

export function isPostLiveRegistryPhase(
  phase: SeasonPhase | null | undefined
): boolean {
  return phase === 'claim' || phase === 'archived';
}

export function resolveStandingsReserveRewardSlot({
  showPublishedRewards,
  seasonPhase,
  registryPhase,
  standingsLoading = false,
}: {
  showPublishedRewards: boolean;
  seasonPhase: SeasonZeroLifecyclePhase | null;
  registryPhase?: SeasonPhase | null;
  /** Reserve SOCIAL row while standings load unless the season is known live/upcoming. */
  standingsLoading?: boolean;
}): boolean {
  if (seasonPhase === 'live' || seasonPhase === 'upcoming') {
    return false;
  }

  if (registryPhase === 'live' || registryPhase === 'upcoming') {
    return false;
  }

  if (showPublishedRewards) {
    return true;
  }

  if (seasonPhase != null) {
    return true;
  }

  if (isPostLiveRegistryPhase(registryPhase)) {
    return true;
  }

  return standingsLoading;
}

/** Avoid a 5-row flash before settlement participant count arrives on post-live pages. */
export function resolveStandingsSkeletonRowCountForPage({
  participantHint,
  registryPhase,
}: {
  participantHint: number;
  registryPhase?: SeasonPhase | null;
}): number {
  if (participantHint > 0) {
    return resolveStandingsSkeletonRowCount(participantHint);
  }

  if (isPostLiveRegistryPhase(registryPhase)) {
    return 1;
  }

  return resolveStandingsSkeletonRowCount(0);
}

/** Route loading shell — align standings skeleton with client hydration. */
export function resolveSeasonPageLoadingShellStandings({
  registryPhase = 'live',
  participantHint = 0,
}: {
  registryPhase?: SeasonPhase | null;
  participantHint?: number;
} = {}) {
  const rowCount = resolveStandingsSkeletonRowCountForPage({
    participantHint,
    registryPhase,
  });

  return {
    rowCount,
    listMinClass: standingsListMinClass(rowCount),
    reserveRewardSlot: resolveStandingsReserveRewardSlot({
      showPublishedRewards: false,
      seasonPhase: null,
      registryPhase,
      standingsLoading: true,
    }),
  };
}

export function standingsListMinClass(rowCount: number): string {
  const clamped = Math.max(
    1,
    Math.min(SEASON_STANDINGS_SKELETON_MAX_ROWS, rowCount)
  );

  return (
    STANDINGS_LIST_MIN_BY_ROW_COUNT[clamped] ?? SEASON_STANDINGS_LIST_MIN_CLASS
  );
}

/** Right column in standing rows — pts + optional reward stack. */
export const SEASON_STANDING_SCORE_COLUMN_CLASS =
  'shrink-0 min-w-[6.25rem] text-right';

/** Fixed reward line — wide enough for 1,234.5 SOCIAL without reflow. */
export const SEASON_STANDING_REWARD_ROW_CLASS =
  'mt-1 block h-4 min-w-[6.25rem] whitespace-nowrap text-right text-xs font-semibold leading-none tabular-nums';

/** Invisible SOCIAL reserve — matches loaded reward line box. */
export const SEASON_STANDING_REWARD_RESERVE_CLASS =
  'ml-auto block h-4 w-[6.25rem] max-w-full';

/** Handle + score-mix block — fixed height between skeleton and loaded rows. */
export const SEASON_STANDING_DETAIL_BLOCK_CLASS = 'h-[2.75rem]';

/** @handle + signals caption line — portal-type-caption line box. */
export const SEASON_STANDING_SIGNAL_ROW_CLASS = 'min-h-3.5';

/** Join · Profile · Endorse mix line. */
export const SEASON_STANDING_SCORE_MIX_ROW_CLASS = 'min-h-[1.125rem]';

/** Mix breakdown bar — fixed flex height (rank segments use h-full). */
export const SEASON_STANDING_SCORE_MIX_BAR_ROW_CLASS =
  'mt-1 flex h-0.5 overflow-hidden rounded-full bg-border/20';

/** Your standing header row — eyebrow baseline rail. */
export const SEASON_STANDING_HEADER_ROW_CLASS =
  'flex min-h-[0.84375rem] items-center justify-between gap-3';

export const SEASON_STANDING_HEADER_LEFT_CLASS =
  'flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1';

/** Loaded “View ↓” link — matches eyebrow-wide + arrow. */
export const SEASON_STANDING_HEADER_VIEW_LINK_CLASS =
  'inline-flex shrink-0 items-center gap-0.5 portal-eyebrow-wide';

/** Reserved “View ↓” slot — same box as the loaded link. */
export const SEASON_STANDING_HEADER_VIEW_SLOT_CLASS =
  'inline-flex h-[0.84375rem] w-[2.625rem] shrink-0 items-center gap-0.5';

/** Loaded Rules control — micro line. */
export const SEASON_STANDING_HEADER_RULES_LINK_CLASS =
  'shrink-0 portal-type-micro text-muted-foreground/75';

/** Reserved Rules slot — portal-type-micro line box. */
export const SEASON_STANDING_HEADER_RULES_SLOT_CLASS =
  'inline-flex h-[0.75rem] w-9 shrink-0 items-center justify-end';

/** @deprecated Use {@link SEASON_STANDING_HEADER_VIEW_SLOT_CLASS}. */
export const SEASON_STANDING_HEADER_LINK_SLOT_CLASS =
  SEASON_STANDING_HEADER_VIEW_SLOT_CLASS;

/** Invisible “View” text pulse inside the view slot. */
export const SEASON_STANDING_HEADER_VIEW_SKELETON_CLASS =
  'h-[0.625rem] w-[1.375rem] rounded-full bg-foreground/[0.06]';

/** Invisible Rules text pulse inside the rules slot. */
export const SEASON_STANDING_HEADER_RULES_SKELETON_CLASS =
  'h-[0.625rem] w-6 rounded-full bg-foreground/[0.06]';

export function SeasonPageColumn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        SEASON_PAGE_COLUMN_CLASS,
        'space-y-3 md:space-y-4',
        className
      )}
    >
      {children}
    </div>
  );
}
