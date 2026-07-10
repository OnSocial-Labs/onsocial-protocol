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
  SheetCloseButton,
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
import { pageContentDrawerPanelStyle } from '@/lib/moods/resolve';
import type { ResolvedMood } from '@/lib/moods/types';

interface PageJoinedFactsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageAccountId: string;
  meta: PageDrawerMeta;
  mood: ResolvedMood;
}

function CountValue({
  count,
  unit,
}: {
  count: string;
  unit: string;
}) {
  return (
    <span className="page-joined-fact-count-value">
      <span className="page-joined-fact-count">{count}</span>
      <span className="page-joined-fact-unit"> {unit}</span>
    </span>
  );
}

function FactRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="page-joined-fact-row">
      <span className="page-joined-fact-label">{label}</span>
      <span className="page-joined-fact-value">{value}</span>
    </div>
  );
}

function FactSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="page-joined-fact-section">
      <h3 className="page-joined-fact-section-title">{title}</h3>
      <div className="page-joined-fact-section-rows">{children}</div>
    </section>
  );
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

    return () => {
      cancelled = true;
    };
  }, [open, pageAccountId]);

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
    <FactRow
      key="joined"
      label="Joined"
      value={joinedFull ?? joinedShort ?? '—'}
    />,
  ];
  if (updatedValue) {
    onSocialRows.push(
      <FactRow key="updated" label="Updated" value={updatedValue} />
    );
  }
  if (posts)
    onSocialRows.push(
      <FactRow
        key="posts"
        label="Posts"
        value={<CountValue count={posts.count} unit={posts.unit} />}
      />
    );
  if (guilds)
    onSocialRows.push(
      <FactRow
        key="guilds"
        label="Guilds"
        value={<CountValue count={guilds.count} unit={guilds.unit} />}
      />
    );
  if (scarces)
    onSocialRows.push(
      <FactRow
        key="scarces"
        label="Scarces"
        value={<CountValue count={scarces.count} unit={scarces.unit} />}
      />
    );
  if (meta.daoRoleLabels.length > 0) {
    onSocialRows.push(
      <FactRow
        key="roles"
        label="Roles"
        value={meta.daoRoleLabels.join(' · ')}
      />
    );
  }
  if (meta.tags.length > 0) {
    onSocialRows.push(
      <FactRow key="tags" label="Tags" value={meta.tags.join(' · ')} />
    );
  }

  return (
    <GlassSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      tone="mood-thread"
      moodId={mood.id}
      panelStyle={panelStyle}
      initialDetent="full"
      zIndex={52}
      ariaLabelledBy="page-joined-facts-title"
      backdropLabel="Close account facts"
      bodyClassName="page-joined-facts-body"
      panelClassName="page-joined-facts-panel"
      header={
        <>
          <div className="page-joined-facts-header">
            <div className="page-joined-facts-header-copy">
              <h2 id="page-joined-facts-title" className="page-joined-facts-title">
                Account
              </h2>
              <p className="page-joined-facts-subtitle">{meta.name}</p>
            </div>
            <SheetCloseButton onClick={requestClose} ariaLabel="Close" />
          </div>
          <Divider variant="section" className="glass-sheet-header-divider" />
        </>
      }
    >
      <div className="page-joined-facts">
        <FactSection title="OnSocial">{onSocialRows}</FactSection>

        <Divider variant="detail" />

        <FactSection title="NEAR">
          <FactRow label="Network" value={nearNetworkLabel()} />
          <FactRow
            label="Account"
            value={
              <ExplorerLink href={explorerHref}>{pageAccountId}</ExplorerLink>
            }
          />
          {creationLoading ? (
            <FactRow label="Created" value="…" />
          ) : createdLabel ? (
            <FactRow
              label="Created"
              value={
                <ExplorerLink href={createdHref}>{createdLabel}</ExplorerLink>
              }
            />
          ) : null}
        </FactSection>
      </div>
    </GlassSheet>
  );
}
