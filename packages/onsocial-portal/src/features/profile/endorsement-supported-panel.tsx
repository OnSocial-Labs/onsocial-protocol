'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EndorsementSupportAmountSummary } from '@/components/endorsement-support-amount-summary';
import { EndorsementRecord } from '@/components/ui/endorsement-flow';
import { ProtocolMotionArrow } from '@onsocial/ui';
import { ProfileListSkeletonRows } from '@/features/profile/profile-list-loading';
import {
  buildEndorsementViewOptions,
  ProfileListFilterRail,
} from '@/features/profile/profile-list-filter-rail';
import { profileListContainerClass } from '@/features/profile/profile-list-row';
import {
  humanizeEndorsementTopic,
  formatEndorsementTime,
} from '@/lib/endorsements';
import { fadeMotion } from '@/lib/motion';
import {
  getPortalEndorsementSupportersUrl,
  getPortalEndorsementsUrl,
} from '@/lib/portal-config';
import { formatProfileCount } from '@/lib/profile-social-standings';
import {
  fetchEndorsementSupportGiven,
  type EndorsementSupportGivenRow,
} from '@/lib/social-spend-endorsement';
import { formatSupportBalanceLabel } from '@/lib/social-spend-profile';
import { parseLegacyEndorsementSpendTargetId } from '@onsocial/sdk';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Could not load supported endorsements.';
}

function formatAmount(yocto: string): string {
  try {
    return formatSupportBalanceLabel(BigInt(yocto));
  } catch {
    return '0';
  }
}

function resolveSupportedParties(row: EndorsementSupportGivenRow): {
  issuer: string;
  target: string;
  topic: string | null;
} {
  const legacy = parseLegacyEndorsementSpendTargetId(row.endorsementId);
  return {
    issuer: row.issuer ?? legacy?.issuer ?? '',
    target: row.recipientId ?? legacy?.target ?? '',
    topic: row.topic ?? legacy?.topic ?? null,
  };
}

function EndorsementSupportedRowLinks({
  endorsementHref,
  supportersHref,
}: {
  endorsementHref: string | null;
  supportersHref: string;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 portal-type-caption text-muted-foreground/65 sm:w-auto">
      {endorsementHref ? (
        <Link
          href={endorsementHref}
          className="group inline-flex items-center gap-1 font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
        >
          View endorsement
          <ProtocolMotionArrow className="h-2.5 w-2.5 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-foreground" />
        </Link>
      ) : null}
      <Link
        href={supportersHref}
        className="group inline-flex items-center gap-1 font-medium text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        Supporters
        <ProtocolMotionArrow className="h-2.5 w-2.5 shrink-0 text-muted-foreground/55 transition-colors group-hover:text-[var(--portal-green)]" />
      </Link>
    </div>
  );
}

function EndorsementSupportedRow({ row }: { row: EndorsementSupportGivenRow }) {
  const parties = resolveSupportedParties(row);
  const endorsementHref =
    parties.issuer && parties.target
      ? getPortalEndorsementsUrl(parties.target, {
          mode: 'received',
          issuer: parties.issuer,
          target: parties.target,
          topic: parties.topic,
        })
      : null;
  const supportersHref = getPortalEndorsementSupportersUrl(
    parties.target || row.recipientId || '',
    {
      endorsementId: row.endorsementId,
      issuer: parties.issuer || undefined,
      target: parties.target || undefined,
      topic: parties.topic,
    }
  );
  const timeLabel = formatEndorsementTime(row.latestSupportAt);

  if (!parties.issuer || !parties.target) {
    return null;
  }

  return (
    <div className="px-2 py-2.5">
      <EndorsementRecord
        issuer={parties.issuer}
        target={parties.target}
        issuerName={row.issuerName}
        targetName={row.recipientName}
        issuerAvatarUrl={row.issuerAvatarUrl}
        targetAvatarUrl={row.recipientAvatarUrl}
        topic={parties.topic}
        note={row.note}
        mediaUrl={row.mediaUrl}
        mediaMime={row.mediaMime}
        noteClamp={2}
        pageLayout
        trailing={
          <EndorsementSupportAmountSummary
            amountLabel={formatAmount(row.totalAmountYocto)}
            spendCount={row.spendCount}
            timeLabel={timeLabel}
            className="shrink-0 text-right"
          />
        }
        footerTrailing={
          <EndorsementSupportedRowLinks
            endorsementHref={endorsementHref}
            supportersHref={supportersHref}
          />
        }
      />
    </div>
  );
}

export function EndorsementSupportedPanel({
  accountId,
  metaLoaded = true,
  endorsementCounts,
}: {
  accountId: string;
  metaLoaded?: boolean;
  endorsementCounts: { received: number; given: number };
}) {
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<EndorsementSupportGivenRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void fetchEndorsementSupportGiven(accountId)
      .then((response) => {
        if (!cancelled) setItems(response.items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error));
          setItems([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;

    return items.filter((row) => {
      const parties = resolveSupportedParties(row);
      const haystack = [
        parties.issuer,
        parties.target,
        parties.topic,
        row.issuerName,
        row.recipientName,
        row.note,
        humanizeEndorsementTopic(parties.topic ?? undefined),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query]);

  const viewOptions = useMemo(
    () =>
      buildEndorsementViewOptions({
        accountId,
        activeMode: 'supported',
        counts: {
          received: endorsementCounts.received,
          given: endorsementCounts.given,
          supported: items.length,
        },
        isSelf: true,
      }),
    [
      accountId,
      endorsementCounts.given,
      endorsementCounts.received,
      items.length,
    ]
  );

  const resultsSummary =
    !isLoading && filteredItems.length > 0
      ? `${formatProfileCount(filteredItems.length)} supported endorsement${filteredItems.length === 1 ? '' : 's'}`
      : null;

  return (
    <div className="flex flex-col gap-4">
      <ProfileListFilterRail
        menuLabel="Endorsements"
        options={viewOptions}
        activeOptionId="supported"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search supported endorsements"
        clearAriaLabel="Clear supported search"
        autoFocus={metaLoaded}
        isLoading={!metaLoaded || isLoading}
      />

      {loadError ? (
        <p className="rounded-xl border border-[var(--portal-red-border)] bg-[var(--portal-red-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--portal-red)]">
          {loadError}
        </p>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        {!metaLoaded || isLoading ? (
          <motion.div
            key="supported-loading"
            {...fadeMotion(reduceMotion ? 0 : 0.12)}
          >
            <ProfileListSkeletonRows variant="endorsement" count={6} />
          </motion.div>
        ) : filteredItems.length === 0 ? (
          <motion.p
            key="supported-empty"
            {...fadeMotion(reduceMotion ? 0 : 0.12)}
            className="px-3 py-8 text-center text-sm text-muted-foreground/70"
          >
            {query.trim()
              ? 'No matching supported endorsements.'
              : 'You have not supported any endorsements with SOCIAL yet.'}
          </motion.p>
        ) : (
          <motion.div
            key="supported-loaded"
            {...fadeMotion(reduceMotion ? 0 : 0.14)}
            className={profileListContainerClass}
          >
            {filteredItems.map((row) => (
              <EndorsementSupportedRow key={row.endorsementId} row={row} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {resultsSummary ? (
        <p className="px-1 text-center portal-type-caption text-muted-foreground/55">
          {resultsSummary}
        </p>
      ) : null}
    </div>
  );
}
