'use client';

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Divider,
  GlassSheet,
  ProtocolMotionArrow,
  SheetHeader,
  osHugSheetBodyClassName,
} from '@onsocial/ui';
import {
  SheetFactCount,
  SheetFactRow,
  SheetFactSection,
} from '@onsocial/ui';
import {
  fetchNearAccountCreation,
  nearAccountExplorerHref,
  nearNetworkLabel,
  type AppNearAccountCreation,
} from '@/lib/app-near-account-facts';
import {
  formatCompactCount,
  formatPageDrawerJoinedFullLabel,
  formatPageDrawerJoinedLabel,
  formatPageDrawerUpdatedFieldsLine,
  shouldShowProfileUpdated,
  type PageDrawerMeta,
} from '@/lib/page-drawer-meta';
import { fetchDaoRolesClient } from '@/lib/fetch-dao-roles-client';
import { pageContentDrawerPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';

interface PageJoinedFactsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageAccountId: string;
  meta: PageDrawerMeta;
  mood: ResolvedMood;
}

function ExplorerLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="page-joined-fact-link group"
    >
      <span className="page-joined-fact-account">{children}</span>
      <ProtocolMotionArrow className="page-joined-fact-arrow" />
    </a>
  );
}

export function PageJoinedFactsSheet({
  open,
  onOpenChange,
  pageAccountId,
  meta,
  mood,
}: PageJoinedFactsSheetProps) {
  const [closing, setClosing] = useState(false);
  const [creation, setCreation] = useState<AppNearAccountCreation | null>(null);
  const [creationLoading, setCreationLoading] = useState(false);
  const [fetchedDaoRoles, setFetchedDaoRoles] = useState<string[] | null>(null);
  const daoRoleLabels =
    meta.daoRoleLabels.length > 0
      ? meta.daoRoleLabels
      : (fetchedDaoRoles ?? []);
  const sheetOpen = open && !closing;
  const joinedShort = formatPageDrawerJoinedLabel(meta.joinedAt);
  const joinedFull = formatPageDrawerJoinedFullLabel(meta.joinedAt);
  const explorerHref = nearAccountExplorerHref(pageAccountId);
  const panelStyle = pageContentDrawerPanelStyle(mood.cssVars) as CSSProperties;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setCreationLoading(true);
      }
    });

    void fetchNearAccountCreation(pageAccountId)
      .then((next) => {
        if (!cancelled) {
          setCreation(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCreation(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCreationLoading(false);
        }
      });

    // Soft-fill DAO credentials after sheet open (not on portfolio SSR).
    if (meta.daoRoleLabels.length === 0) {
      void fetchDaoRolesClient(pageAccountId)
        .then((payload) => {
          if (!cancelled && payload.daoRoleLabels.length > 0) {
            setFetchedDaoRoles(payload.daoRoleLabels);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [meta.daoRoleLabels.length, open, pageAccountId]);

  const posts =
    meta.postCount > 0
      ? {
          count: formatCompactCount(meta.postCount),
          unit: Math.floor(meta.postCount) === 1 ? 'post' : 'posts',
        }
      : null;
  const guilds =
    meta.guildCount > 0
      ? {
          count: formatCompactCount(meta.guildCount),
          unit: Math.floor(meta.guildCount) === 1 ? 'guild' : 'guilds',
        }
      : null;
  const scarces =
    meta.scarceMintCount > 0
      ? {
          count: formatCompactCount(meta.scarceMintCount),
          unit: Math.floor(meta.scarceMintCount) === 1 ? 'scarce' : 'scarces',
        }
      : null;
  const showUpdated = shouldShowProfileUpdated(meta.joinedAt, meta.updatedAt);
  const updatedLabel = showUpdated
    ? formatPageDrawerJoinedFullLabel(meta.updatedAt)
    : null;
  const updatedFieldsLine = showUpdated
    ? formatPageDrawerUpdatedFieldsLine(meta.updatedFields)
    : null;
  const updatedValue =
    updatedLabel && updatedFieldsLine
      ? `${updatedLabel} · ${updatedFieldsLine}`
      : updatedLabel;
  const createdLabel = creation
    ? formatPageDrawerJoinedFullLabel(creation.blockTimestamp)
    : null;
  const createdHref = creation?.explorerUrl ?? explorerHref;

  const onSocialRows: ReactNode[] = [
    <SheetFactRow
      key="joined"
      label="Joined"
      value={joinedFull ?? joinedShort ?? '—'}
    />,
  ];
  if (updatedValue) {
    onSocialRows.push(
      <SheetFactRow key="updated" label="Updated" value={updatedValue} />
    );
  }
  if (posts)
    onSocialRows.push(
      <SheetFactRow
        key="posts"
        label="Posts"
        value={<SheetFactCount count={posts.count} unit={posts.unit} />}
      />
    );
  if (guilds)
    onSocialRows.push(
      <SheetFactRow
        key="guilds"
        label="Guilds"
        value={<SheetFactCount count={guilds.count} unit={guilds.unit} />}
      />
    );
  if (scarces)
    onSocialRows.push(
      <SheetFactRow
        key="scarces"
        label="Scarces"
        value={<SheetFactCount count={scarces.count} unit={scarces.unit} />}
      />
    );
  if (daoRoleLabels.length > 0) {
    onSocialRows.push(
      <SheetFactRow
        key="roles"
        label="Roles"
        value={daoRoleLabels.join(' · ')}
      />
    );
  }

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="mood-thread"
      sizing="hug"
      moodId={mood.id}
      panelStyle={panelStyle}
      initialDetent="full"
      zIndex={52}
      ariaLabelledBy="page-joined-facts-title"
      backdropLabel="Close account facts"
      bodyClassName={osHugSheetBodyClassName}
      panelClassName="page-joined-facts-panel"
      header={
        <>
          <SheetHeader
            titleId="page-joined-facts-title"
            eyebrow="Account"
            title={meta.name}
            onClose={requestClose}
            closeAriaLabel="Close"
          />
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="guild-facts page-joined-facts">
        <SheetFactSection title="OnSocial">{onSocialRows}</SheetFactSection>

        <Divider variant="detail" />

        <SheetFactSection title="NEAR">
          <SheetFactRow label="Network" value={nearNetworkLabel()} />
          <SheetFactRow
            label="Account"
            value={
              <ExplorerLink href={explorerHref}>{pageAccountId}</ExplorerLink>
            }
          />
          {creationLoading ? (
            <SheetFactRow label="Created" value="…" />
          ) : createdLabel ? (
            <SheetFactRow
              label="Created"
              value={
                <ExplorerLink href={createdHref}>{createdLabel}</ExplorerLink>
              }
            />
          ) : null}
        </SheetFactSection>
      </div>
    </GlassSheet>
  );
}
