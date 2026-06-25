import type { ReactNode } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  cleanHandle,
  humanizeEndorsementTopic,
  endorsementPartyName,
  endorsementPartyAt,
  resolveEndorsementListPartyDisplay,
  type EndorsementListPartyContext,
} from '@/lib/endorsements';
import {
  parseEndorsementMediaRef,
  resolveEndorsementDisplayMediaUrl,
} from '@/lib/endorsement-media';
import {
  ACTIVE_NEAR_NETWORK,
  type PortalEndorsementsMode,
} from '@/lib/portal-config';
import { ProfileGraphChipLink } from '@/lib/profile-graph-link';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { PortalHoverTooltip } from '@/components/ui/portal-hover-tooltip';
import {
  ShareEndorsement,
  type EndorsementShareContext,
} from '@/components/ui/endorsement-share';
import {
  useEndorsementVideoPlayback,
  type EndorsementVideoPlaybackMode,
} from '@/hooks/use-endorsement-list-video';
import { cn } from '@/lib/utils';

export { endorsementPartyName, endorsementPartyAt };
export type { EndorsementShareContext };

/** Soft gold spine along the content edge — marks the card as an endorsement. */
const endorsementRecordAccentClass =
  'pointer-events-none absolute bottom-1 left-0 top-1 w-px shrink-0 [background-image:var(--divider-v-gold-detail)]';

/** Default list-card props — match profile “Latest endorsement” preview. */
export const ENDORSEMENT_LIST_CARD_DEFAULTS = {
  noteClamp: 2 as const,
  mediaSize: 'compact' as const,
};

/** Row shell — unified hover across topic, quote, attribution, and profile chips. */
export const endorsementListRowClass =
  'group flex w-full cursor-pointer flex-col rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--portal-neutral-bg)] focus-visible:bg-[var(--portal-neutral-bg)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--portal-gold-accent)]';

/** Endorsement quote — same body tone as profile page bio. */
export const endorsementNoteClass =
  'mt-1.5 m-0 portal-type-body leading-relaxed text-muted-foreground';

/** Endorsement attachment caps — shrink-wrap frame, no crop, responsive max height. */
const endorsementMediaMaxHeightClass = {
  /** Profile rows, modals, compact lists. */
  compact: 'max-h-48 sm:max-h-52',
  /** Compose / edit modal. */
  preview: 'max-h-56 sm:max-h-72',
  /** Full endorsements page — roomier on desktop. */
  page: 'max-h-52 sm:max-h-72 lg:max-h-80',
} as const;

/** Open endorsement detail — shared right edge for time, media, profiles, share. */
const endorsementFocusedLaneClass =
  'w-full max-w-sm min-w-0 sm:max-w-md lg:max-w-xl';

export type EndorsementMediaSize = keyof typeof endorsementMediaMaxHeightClass;

export type EndorsementRowActivateOptions = {
  unmuteVideo?: boolean;
  videoTime?: number;
  videoWasPlaying?: boolean;
};

const endorsementMediaElementClass = 'block h-auto w-auto max-w-full align-top';

/** Optional photo or video between note and attribution. */
export function EndorsementMediaBlock({
  mediaUrl,
  mime,
  className,
  size = 'compact',
  focused = false,
  focusedVideoMuted = true,
  initialVideoTime = 0,
  resumeFocusedVideo = false,
  onListVideoActivate,
  onRemoveMedia,
}: {
  mediaUrl: string;
  mime?: string | null;
  className?: string;
  /** `preview` — compose modal; `page` — full endorsements page; `compact` — list rows. */
  size?: EndorsementMediaSize;
  /** Detail card — larger media with native controls. */
  focused?: boolean;
  /** Detail playback starts muted unless user opened via video tap. */
  focusedVideoMuted?: boolean;
  initialVideoTime?: number;
  resumeFocusedVideo?: boolean;
  /** List row — open detail card with sound. */
  onListVideoActivate?: () => void;
  onRemoveMedia?: () => void;
}) {
  const isVideo = Boolean(mime?.toLowerCase().startsWith('video/'));
  const playbackMode: EndorsementVideoPlaybackMode = onRemoveMedia
    ? null
    : isVideo
      ? focused
        ? focusedVideoMuted
          ? 'detail-muted'
          : 'detail-unmuted'
        : 'list'
      : null;
  const { containerRef, videoRef } = useEndorsementVideoPlayback(
    playbackMode,
    focused
      ? { initialTime: initialVideoTime, resume: resumeFocusedVideo }
      : undefined
  );
  const mediaClass = cn(
    endorsementMediaElementClass,
    endorsementMediaMaxHeightClass[size]
  );
  const isListVideo = playbackMode === 'list';
  const isDetailVideo =
    playbackMode === 'detail-muted' || playbackMode === 'detail-unmuted';

  return (
    <div
      ref={playbackMode ? containerRef : undefined}
      className={cn(
        'relative mt-2 w-fit max-w-full overflow-hidden rounded-xl border border-border/50 bg-background/40 shadow-sm',
        isListVideo && onListVideoActivate && 'cursor-pointer',
        className
      )}
      onClick={
        isListVideo && onListVideoActivate
          ? (event) => {
              event.stopPropagation();
              onListVideoActivate();
            }
          : undefined
      }
      onPointerDown={
        isListVideo && onListVideoActivate
          ? (event) => event.stopPropagation()
          : undefined
      }
    >
      {isVideo ? (
        <video
          ref={playbackMode ? videoRef : undefined}
          src={mediaUrl}
          controls={isDetailVideo}
          playsInline
          muted={isListVideo}
          loop={isListVideo}
          preload="metadata"
          data-endorsement-focus-video={isDetailVideo ? true : undefined}
          className={mediaClass}
        />
      ) : (
        <img
          src={mediaUrl}
          alt=""
          className={mediaClass}
          loading="lazy"
          decoding="async"
        />
      )}
      {onRemoveMedia ? (
        <button
          type="button"
          onClick={onRemoveMedia}
          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          aria-label="Remove attached media"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Party avatar — two-up attribution: smaller on mobile, roomier from sm+. */
export const endorsementPartyAvatarClass = 'h-6 w-6 sm:h-7 sm:w-7';

/** Compact context strip — one line name · @handle per party. */
export const endorsementCompactAvatarClass = 'h-5 w-5';

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
  return (
    trimmed !== handle && trimmed !== `@${handle}` && trimmed !== accountId
  );
}

/** Primary label + optional full @accountId for endorsement attribution. */
function resolveEndorsementPartyLabels(
  accountId: string,
  name: string | null | undefined,
  viewerAccountId: string | null | undefined,
  options: {
    labelOverride?: string;
    hideHandle?: boolean;
  } = {}
): { primary: string; secondary: string | null } {
  const { labelOverride, hideHandle = false } = options;
  const fullAt = accountId ? `@${accountId}` : null;

  if (labelOverride) {
    return {
      primary: labelOverride,
      secondary: hideHandle ? null : fullAt,
    };
  }

  const isViewer = Boolean(
    viewerAccountId && accountId && accountId === viewerAccountId
  );
  if (isViewer) {
    return { primary: 'You', secondary: hideHandle ? null : fullAt };
  }

  if (partyHasDistinctName(accountId, name)) {
    return {
      primary: name!.trim(),
      secondary: hideHandle ? null : fullAt,
    };
  }

  const fallbackHandle = accountId ? cleanHandle(accountId) : 'Unknown';
  return {
    primary: fallbackHandle,
    secondary: hideHandle ? null : fullAt,
  };
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
  sizeClass = endorsementPartyAvatarClass,
  className,
}: {
  avatarUrl?: string | null;
  initial: string;
  active?: boolean;
  interactive?: boolean;
  sizeClass?: string;
  className?: string;
}) {
  const hoverBorderClass = interactive
    ? 'transition-colors group-hover/chip:border-foreground/35'
    : null;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={cn(
          sizeClass,
          'shrink-0 rounded-full border object-cover',
          active ? 'border-[var(--portal-gold-border)]' : 'border-border/40',
          hoverBorderClass,
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        sizeClass,
        'flex shrink-0 items-center justify-center rounded-full border portal-type-micro font-semibold',
        active
          ? 'border-[var(--portal-gold-border)] bg-[var(--portal-gold-bg)] text-[var(--portal-gold)]'
          : 'border-border/40 bg-muted/20 text-muted-foreground/70',
        hoverBorderClass,
        className
      )}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

type EndorsementFlowPartyProps = {
  accountId: string;
  name?: string | null;
  viewerAccountId?: string | null;
  avatarUrl?: string | null;
  labelOverride?: string;
  hideHandle?: boolean;
  pageLayout?: boolean;
  onSelectAccount?: (accountId: string) => void;
};

function EndorsementFlowPartyLabel({
  accountId,
  name,
  viewerAccountId,
  labelOverride,
  hideHandle = false,
  pageLayout = false,
  onSelectAccount,
  className,
}: EndorsementFlowPartyProps & { className?: string }) {
  const isViewer = Boolean(
    viewerAccountId && accountId && accountId === viewerAccountId
  );
  const { primary, secondary } = resolveEndorsementPartyLabels(
    accountId,
    name,
    viewerAccountId,
    { labelOverride, hideHandle }
  );
  const isInteractive = Boolean(accountId && (pageLayout || onSelectAccount));

  const labelBody = (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
      <span
        className={cn(
          'shrink-0 whitespace-nowrap font-medium text-foreground/90 transition-colors group-hover/chip:text-foreground',
          isViewer &&
            'text-[var(--portal-gold-text)] group-hover/chip:text-[var(--portal-gold-text)]'
        )}
      >
        {primary}
      </span>
      {secondary ? (
        <>
          <span className="shrink-0 text-muted-foreground/35">·</span>
          <span className="min-w-0 truncate text-muted-foreground/55">
            {secondary}
          </span>
        </>
      ) : null}
    </span>
  );

  const label = isInteractive ? (
    <PortalHoverTooltip
      className="min-w-0 max-w-full portal-type-body-sm"
      tooltip={accountId}
      aria-label={`Account ${accountId}`}
    >
      {labelBody}
    </PortalHoverTooltip>
  ) : (
    <span
      className="min-w-0 max-w-full portal-type-body-sm"
      aria-label={`Account ${accountId}`}
    >
      {labelBody}
    </span>
  );

  if (isInteractive) {
    return (
      <ProfileGraphChipLink
        accountId={accountId}
        pageLayout={pageLayout}
        onNavigate={onSelectAccount}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        className={cn('min-w-0 shrink', className)}
      >
        {label}
      </ProfileGraphChipLink>
    );
  }

  return <span className={cn('min-w-0 shrink', className)}>{label}</span>;
}

function EndorsementFlowPartyAvatar({
  accountId,
  name,
  viewerAccountId,
  avatarUrl,
  labelOverride,
  pageLayout = false,
  onSelectAccount,
  avatarClassName,
  className,
}: EndorsementFlowPartyProps & {
  avatarClassName?: string;
  className?: string;
}) {
  const isViewer = Boolean(
    viewerAccountId && accountId && accountId === viewerAccountId
  );
  const isInteractive = Boolean(accountId && (pageLayout || onSelectAccount));

  const avatar = (
    <EndorsementFlowMiniAvatar
      avatarUrl={avatarUrl}
      initial={partyInitial(accountId, name, labelOverride)}
      active={isViewer}
      sizeClass={endorsementCompactAvatarClass}
      interactive={isInteractive}
      className={avatarClassName}
    />
  );

  if (isInteractive) {
    return (
      <ProfileGraphChipLink
        accountId={accountId}
        pageLayout={pageLayout}
        onNavigate={onSelectAccount}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        ariaLabel={`Open profile for ${accountId}`}
        className={cn('group/chip shrink-0', className)}
      >
        {avatar}
      </ProfileGraphChipLink>
    );
  }

  return <span className={cn('shrink-0', className)}>{avatar}</span>;
}

/** Compact who → who strip — overlapping avatar pair, names inline through ↗. */
export function EndorsementContextStrip({
  issuer,
  target,
  issuerName,
  targetName,
  issuerAvatarUrl,
  targetAvatarUrl,
  viewerAccountId,
  issuerLabelOverride,
  pageLayout = false,
  onSelectAccount,
  trailing,
  timeLabel,
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
  /** Accepted for API parity; the compact strip always hides handles. */
  hideIssuerHandle?: boolean;
  pageLayout?: boolean;
  onSelectAccount?: (accountId: string) => void;
  /** Future actions (e.g. support endorsement). */
  trailing?: ReactNode;
  timeLabel?: ReactNode;
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
    <div className={cn('w-full min-w-0', className)} aria-label={ariaLabel}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 items-center overflow-visible">
          <EndorsementFlowPartyAvatar
            accountId={issuer}
            name={issuerName}
            viewerAccountId={viewerAccountId}
            avatarUrl={issuerAvatarUrl}
            labelOverride={issuerLabelOverride}
            pageLayout={pageLayout}
            onSelectAccount={onSelectAccount}
            avatarClassName="border border-background"
          />
          <EndorsementFlowPartyAvatar
            accountId={target}
            name={targetName}
            viewerAccountId={viewerAccountId}
            avatarUrl={targetAvatarUrl}
            pageLayout={pageLayout}
            onSelectAccount={onSelectAccount}
            className="-ml-1.5"
            avatarClassName="border border-background"
          />
        </span>
        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <EndorsementFlowPartyLabel
            accountId={issuer}
            name={issuerName}
            viewerAccountId={viewerAccountId}
            labelOverride={issuerLabelOverride}
            hideHandle
            pageLayout={pageLayout}
            onSelectAccount={onSelectAccount}
          />
          <ProtocolMotionArrow
            static
            className="h-2.5 w-2.5 shrink-0 text-[var(--portal-gold)]/70 transition-transform duration-200 motion-reduce:transform-none group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
          <EndorsementFlowPartyLabel
            accountId={target}
            name={targetName}
            viewerAccountId={viewerAccountId}
            hideHandle
            pageLayout={pageLayout}
            onSelectAccount={onSelectAccount}
          />
        </span>
      </div>
      {trailing ? (
        <div className="mt-1.5 flex justify-end">{trailing}</div>
      ) : null}
      {timeLabel ? (
        <div className="mt-1.5 flex justify-end">{timeLabel}</div>
      ) : null}
    </div>
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
  pageLayout = false,
  onSelectAccount,
  className,
  trailing,
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
  pageLayout?: boolean;
  onSelectAccount?: (accountId: string) => void;
  className?: string;
  trailing?: ReactNode;
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
      issuerLabelOverride={issuerLabelOverride}
      hideIssuerHandle={hideIssuerHandle}
      pageLayout={pageLayout}
      onSelectAccount={onSelectAccount}
      trailing={trailing}
      className={cn('mt-2.5', className)}
    />
  );
}

function EndorsementFocusedLane({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(endorsementFocusedLaneClass, className)}>{children}</div>
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
  mediaUrl,
  mediaMime,
  mediaSize = 'compact',
  timeLabel,
  trailing,
  issuerLabelOverride,
  hideIssuerHandle = false,
  noteClamp,
  pageLayout = false,
  focused = false,
  focusedVideoMuted = true,
  initialVideoTime = 0,
  resumeFocusedVideo = false,
  onListVideoActivate,
  onSelectAccount,
  className,
  attributionTrailing,
  shareContext,
  footerTrailing,
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
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaSize?: EndorsementMediaSize;
  timeLabel?: ReactNode;
  trailing?: ReactNode;
  issuerLabelOverride?: string;
  hideIssuerHandle?: boolean;
  /** Clamp note lines in compact list surfaces. */
  noteClamp?: 2 | 3;
  /** Detail view — larger media, full note. */
  focused?: boolean;
  focusedVideoMuted?: boolean;
  initialVideoTime?: number;
  resumeFocusedVideo?: boolean;
  onListVideoActivate?: () => void;
  pageLayout?: boolean;
  onSelectAccount?: (accountId: string) => void;
  className?: string;
  /** Row actions beside who → who (legacy — prefer footerTrailing). */
  attributionTrailing?: ReactNode;
  /** Deep-link share targets for footer rail. */
  shareContext?: EndorsementShareContext | null;
  /** Future card actions beside share (e.g. support endorsement). */
  footerTrailing?: ReactNode;
}) {
  const topicLabel = topic?.trim() ? humanizeEndorsementTopic(topic) : null;
  const trimmedNote = note?.trim();
  const trimmedMediaUrl = mediaUrl?.trim() || null;
  const resolvedMediaSize = focused ? 'page' : mediaSize;
  const resolvedNoteClamp = focused ? undefined : noteClamp;
  const hasMedia = Boolean(trimmedMediaUrl);
  const hasBodyContent = Boolean(trimmedNote || trimmedMediaUrl);
  const focusedAttributionClassName = hasBodyContent ? 'mt-2.5' : undefined;
  const listAttributionClassName = hasBodyContent ? 'mt-2.5' : undefined;

  const headerRow = (
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
  );

  const cardBody = (
    <>
      {headerRow}

      {trimmedNote ? (
        <blockquote
          className={cn(
            endorsementNoteClass,
            resolvedNoteClamp === 2 && 'line-clamp-2',
            resolvedNoteClamp === 3 && 'line-clamp-3'
          )}
        >
          &ldquo;{trimmedNote}&rdquo;
        </blockquote>
      ) : null}

      {trimmedMediaUrl ? (
        <EndorsementMediaBlock
          mediaUrl={trimmedMediaUrl}
          mime={mediaMime}
          size={resolvedMediaSize}
          focused={focused}
          focusedVideoMuted={focusedVideoMuted}
          initialVideoTime={initialVideoTime}
          resumeFocusedVideo={resumeFocusedVideo}
          onListVideoActivate={onListVideoActivate}
        />
      ) : null}

      <div
        className={cn(
          'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3',
          focused ? focusedAttributionClassName : listAttributionClassName
        )}
      >
        <EndorsementContextStrip
          issuer={issuer}
          target={target}
          issuerName={issuerName}
          targetName={targetName}
          issuerAvatarUrl={issuerAvatarUrl}
          targetAvatarUrl={targetAvatarUrl}
          viewerAccountId={viewerAccountId}
          issuerLabelOverride={issuerLabelOverride}
          hideIssuerHandle={hideIssuerHandle}
          pageLayout={pageLayout}
          onSelectAccount={onSelectAccount}
          className="min-w-0 flex-1"
        />
        {shareContext || attributionTrailing || footerTrailing ? (
          <>
            <span
              aria-hidden="true"
              className="hidden h-4 w-px shrink-0 self-center [background-image:var(--divider-v-gold-detail)] sm:block"
            />
            {shareContext ? (
              <ShareEndorsement
                {...shareContext}
                embedded
                leading={
                  attributionTrailing || footerTrailing ? (
                    <>
                      {attributionTrailing}
                      {footerTrailing}
                    </>
                  ) : undefined
                }
              />
            ) : (
              <div
                className="flex w-full items-center justify-end gap-2.5 sm:w-auto"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {attributionTrailing}
                {footerTrailing}
              </div>
            )}
          </>
        ) : null}
      </div>
    </>
  );

  return (
    <article className={cn('relative min-w-0 pl-2.5', className)}>
      <span aria-hidden="true" className={endorsementRecordAccentClass} />

      {focused ? (
        <EndorsementFocusedLane>{cardBody}</EndorsementFocusedLane>
      ) : (
        cardBody
      )}
    </article>
  );
}

export type EndorsementListCardRecord = {
  issuer: string;
  target: string;
  id?: string | null;
  topic?: string | null;
  note?: string | null;
  media?: unknown;
  mediaUrl?: string | null;
  issuerName?: string | null;
  targetName?: string | null;
  issuerAvatarUrl?: string | null;
  targetAvatarUrl?: string | null;
};

/** One list row — profile preview, all/given/received, search, and focus. */
export function EndorsementListCardRow({
  record,
  partyContext,
  viewerAccountId = null,
  pageLayout = false,
  focused = false,
  focusedVideoMuted = true,
  initialVideoTime = 0,
  resumeFocusedVideo = false,
  noteClamp = ENDORSEMENT_LIST_CARD_DEFAULTS.noteClamp,
  onSelectAccount,
  onRowClick,
  rowAriaLabel,
  timeLabel,
  trailing,
  shareMode = 'received',
  shareEnabled = true,
  footerTrailing,
}: {
  record: EndorsementListCardRecord;
  partyContext: EndorsementListPartyContext;
  viewerAccountId?: string | null;
  pageLayout?: boolean;
  /** Detail view — larger media and uncapped note. */
  focused?: boolean;
  focusedVideoMuted?: boolean;
  initialVideoTime?: number;
  resumeFocusedVideo?: boolean;
  noteClamp?: 2 | 3;
  onSelectAccount?: (accountId: string) => void;
  onRowClick?: (options?: EndorsementRowActivateOptions) => void;
  rowAriaLabel?: string;
  timeLabel?: ReactNode;
  /** Header actions beside time (e.g. Update). */
  trailing?: ReactNode;
  shareMode?: PortalEndorsementsMode;
  shareEnabled?: boolean;
  /** Footer actions beside share (e.g. SOCIAL support). */
  footerTrailing?: ReactNode;
}) {
  const party = resolveEndorsementListPartyDisplay(record, partyContext);
  const note = record.note?.trim() || undefined;
  const mediaUrl = resolveEndorsementDisplayMediaUrl(
    record,
    ACTIVE_NEAR_NETWORK
  );
  const shareContext: EndorsementShareContext | null =
    shareEnabled && partyContext.pageAccountId
      ? {
          pageAccountId: partyContext.pageAccountId,
          mode: shareMode,
          issuer: record.issuer,
          target: record.target,
          topic: record.topic,
          issuerName: party.issuerName,
          targetName: party.targetName,
          viewerAccountId,
        }
      : null;
  const ariaLabel =
    rowAriaLabel ??
    `Endorsement from ${cleanHandle(record.issuer)} to ${cleanHandle(record.target)}`;
  const rowRef = useRef<HTMLDivElement>(null);

  const readVideoState = (): Pick<
    EndorsementRowActivateOptions,
    'videoTime' | 'videoWasPlaying'
  > => {
    const video = rowRef.current?.querySelector('video');
    return {
      videoTime: video?.currentTime ?? 0,
      videoWasPlaying: Boolean(video && !video.paused),
    };
  };

  const activateRow = (options?: EndorsementRowActivateOptions) => {
    onRowClick?.({ ...readVideoState(), ...options });
  };

  return (
    <div
      ref={rowRef}
      role={onRowClick ? 'button' : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      onClick={() => activateRow({ unmuteVideo: false })}
      onKeyDown={
        onRowClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activateRow({ unmuteVideo: false });
              }
            }
          : undefined
      }
      aria-label={onRowClick ? ariaLabel : undefined}
      className={onRowClick ? endorsementListRowClass : undefined}
    >
      <EndorsementRecord
        issuer={record.issuer}
        target={record.target}
        issuerName={party.issuerName}
        targetName={party.targetName}
        issuerAvatarUrl={party.issuerAvatarUrl}
        targetAvatarUrl={party.targetAvatarUrl}
        viewerAccountId={viewerAccountId}
        topic={record.topic}
        note={note}
        mediaUrl={mediaUrl}
        mediaMime={parseEndorsementMediaRef(record.media)?.mime}
        noteClamp={focused ? undefined : noteClamp}
        mediaSize={ENDORSEMENT_LIST_CARD_DEFAULTS.mediaSize}
        focused={focused}
        focusedVideoMuted={focusedVideoMuted}
        initialVideoTime={initialVideoTime}
        resumeFocusedVideo={resumeFocusedVideo}
        onListVideoActivate={
          onRowClick ? () => activateRow({ unmuteVideo: true }) : undefined
        }
        pageLayout={pageLayout}
        onSelectAccount={onSelectAccount}
        timeLabel={timeLabel}
        trailing={trailing}
        shareContext={shareContext}
        footerTrailing={footerTrailing}
      />
    </div>
  );
}

const endorseEditorFieldClass =
  'w-full bg-transparent outline-none ring-0 focus:ring-0 focus-visible:ring-0';

/** Inline compose shell — same layout as EndorsementRecord, fields editable in place. */
export function EndorsementRecordEditor({
  issuer,
  target,
  issuerName,
  targetName,
  issuerAvatarUrl,
  targetAvatarUrl,
  viewerAccountId,
  issuerLabelOverride,
  hideIssuerHandle = false,
  topic,
  onTopicChange,
  note,
  onNoteChange,
  topicMax,
  noteMax,
  mediaUrl,
  mediaMime,
  onRemoveMedia,
  topicHint,
  suggestedTopics = [],
  onSuggestedTopicPick,
  showSuggestedTopics = false,
  onTopicFocusChange,
  hasMediaAttachment = false,
  noteFieldVisible: noteFieldVisibleProp,
  onNoteFieldVisibleChange,
  contextTrailing,
  timeLabel,
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
  topic: string;
  onTopicChange: (value: string) => void;
  note: string;
  onNoteChange: (value: string) => void;
  topicMax: number;
  noteMax: number;
  mediaUrl?: string | null;
  mediaMime?: string | null;
  onRemoveMedia?: () => void;
  topicHint?: ReactNode;
  suggestedTopics?: readonly string[];
  onSuggestedTopicPick?: (topic: string) => void;
  showSuggestedTopics?: boolean;
  onTopicFocusChange?: (focused: boolean) => void;
  hasMediaAttachment?: boolean;
  noteFieldVisible?: boolean;
  onNoteFieldVisibleChange?: (visible: boolean) => void;
  /** Reserved for future actions (e.g. support endorsement). */
  contextTrailing?: ReactNode;
  timeLabel?: ReactNode;
  className?: string;
}) {
  const topicId = useId();
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const trimmedMediaUrl = mediaUrl?.trim() || null;
  const trimmedTopic = topic.trim();
  const trimmedNote = note.trim();
  const noteCollapsed = hasMediaAttachment && !trimmedNote;
  const [noteFieldVisibleInternal, setNoteFieldVisibleInternal] = useState(
    () => !noteCollapsed
  );
  const noteFieldVisible = noteFieldVisibleProp ?? noteFieldVisibleInternal;
  const setNoteFieldVisible =
    onNoteFieldVisibleChange ?? setNoteFieldVisibleInternal;

  useEffect(() => {
    if (trimmedNote) {
      setNoteFieldVisible(true);
    }
  }, [trimmedNote, setNoteFieldVisible]);

  useEffect(() => {
    if (!hasMediaAttachment) {
      setNoteFieldVisible(true);
    }
  }, [hasMediaAttachment, setNoteFieldVisible]);

  useEffect(() => {
    if (noteFieldVisible && noteCollapsed && noteRef.current) {
      requestAnimationFrame(() => noteRef.current?.focus());
    }
  }, [noteFieldVisible, noteCollapsed]);

  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [note, noteCollapsed]);

  return (
    <article className={cn('relative min-w-0 pl-2.5', className)}>
      <span aria-hidden="true" className={endorsementRecordAccentClass} />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={topicId} className="sr-only">
            Topic
          </label>
          <input
            id={topicId}
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            onFocus={() => onTopicFocusChange?.(true)}
            onBlur={() => onTopicFocusChange?.(false)}
            placeholder="Design, Governance, …"
            maxLength={topicMax}
            className={cn(
              endorseEditorFieldClass,
              'portal-type-lead font-medium text-[var(--portal-gold-text)] placeholder:text-[var(--portal-gold-text)]/35'
            )}
            aria-required="true"
          />
        </div>
        {timeLabel ? (
          <div className="flex shrink-0 items-center gap-1.5">{timeLabel}</div>
        ) : null}
      </div>

      {topicHint ? (
        <div className="mt-1 min-h-[14px] portal-type-caption text-muted-foreground/55">
          {topicHint}
        </div>
      ) : null}

      {showSuggestedTopics && suggestedTopics.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {suggestedTopics.map((suggestion) => {
            const active =
              trimmedTopic.toLowerCase() === suggestion.toLowerCase();
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestedTopicPick?.(active ? '' : suggestion)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-2 py-0.5 portal-type-label font-medium transition-colors',
                  active
                    ? 'border-border/60 bg-background text-foreground shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]'
                    : 'border-transparent text-muted-foreground hover:border-border/40 hover:text-foreground'
                )}
              >
                {suggestion}
              </button>
            );
          })}
        </div>
      ) : null}

      <label htmlFor={noteId} className="sr-only">
        Why
      </label>
      {!noteFieldVisible && noteCollapsed ? null : (
        <blockquote
          className={cn(
            noteCollapsed ? 'mt-1' : endorsementNoteClass,
            'relative'
          )}
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 text-muted-foreground/35"
          >
            &ldquo;
          </span>
          <textarea
            ref={noteRef}
            id={noteId}
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            placeholder={
              hasMediaAttachment
                ? 'Optional — why this endorsement matters'
                : 'Why you\u2019re putting your name behind them'
            }
            rows={1}
            maxLength={noteMax}
            className={cn(
              endorseEditorFieldClass,
              'min-h-[1.375rem] resize-none overflow-hidden pl-3.5 leading-relaxed text-muted-foreground placeholder:text-muted-foreground/40'
            )}
            aria-required={!hasMediaAttachment}
          />
          {trimmedNote ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 text-muted-foreground/35"
            >
              &rdquo;
            </span>
          ) : null}
        </blockquote>
      )}

      {trimmedMediaUrl ? (
        <EndorsementMediaBlock
          mediaUrl={trimmedMediaUrl}
          mime={mediaMime}
          size="preview"
          onRemoveMedia={onRemoveMedia}
        />
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
        trailing={contextTrailing}
        className={!trimmedNote && !trimmedMediaUrl ? 'mt-1.5' : undefined}
      />
    </article>
  );
}
