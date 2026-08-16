'use client';

/**
 * DAO portfolio page — shared portfolio language with square crest.
 * Protocol stays the fast lane; this is the org home.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Divider,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  SettingsIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { rememberCommunityDao } from '@/features/protocol/dao-accounts';
import {
  daoEntityKindLabel,
  type DaoBranding,
} from '@/features/protocol/dao-branding';
import { DaoEditSheet } from '@/features/protocol/dao-edit-sheet';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { seedDaoBrandingCache } from '@/lib/dao-shell-cache';
import { softIndexDaoMemberships } from '@/features/protocol/my-daos-client';
import { initials } from '@/lib/profile-display';
import {
  APP_DAOS_PATH,
  APP_GROUPS_PATH,
  protocolPath,
} from '@/lib/app-routes';

interface DaoPortfolioPanelProps {
  initialBranding: DaoBranding;
  configName: string | null;
  configPurpose: string | null;
  configMetadata: string;
}

type OptimisticDaoProfile = {
  daoAccountId: string;
  branding: DaoBranding;
  metadata: string;
};

type EligibilitySnapshot = {
  key: string;
  value: ProtocolGovernanceEligibility;
};

function eligibilityKey(accountId: string, daoAccountId: string): string {
  return `${accountId}:${daoAccountId}`;
}

export function DaoPortfolioPanel({
  initialBranding,
  configName,
  configPurpose,
  configMetadata,
}: DaoPortfolioPanelProps) {
  const router = useRouter();
  const { accountId } = useAppWallet();
  const [optimistic, setOptimistic] = useState<OptimisticDaoProfile | null>(
    null
  );
  const [editing, setEditing] = useState(false);
  const [eligibility, setEligibility] = useState<EligibilitySnapshot | null>(
    null
  );

  const branding =
    optimistic?.daoAccountId === initialBranding.daoAccountId
      ? optimistic.branding
      : initialBranding;
  const metadata =
    optimistic?.daoAccountId === initialBranding.daoAccountId
      ? optimistic.metadata
      : configMetadata;

  useEffect(() => {
    seedDaoBrandingCache(initialBranding.daoAccountId, branding);
  }, [branding, initialBranding.daoAccountId]);

  useEffect(() => {
    if (branding.kind === 'community') {
      rememberCommunityDao(branding.daoAccountId);
    }
  }, [branding.daoAccountId, branding.kind]);

  useEffect(() => {
    softIndexDaoMemberships(branding.daoAccountId);
  }, [branding.daoAccountId]);

  useEffect(() => {
    if (!accountId) return;
    const key = eligibilityKey(accountId, branding.daoAccountId);
    let cancelled = false;
    void getProtocolGovernanceEligibility(
      accountId,
      branding.daoAccountId
    ).then((next) => {
      if (!cancelled) setEligibility({ key, value: next });
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, branding.daoAccountId]);

  const canEdit = Boolean(
    accountId &&
      eligibility?.key ===
        eligibilityKey(accountId, branding.daoAccountId) &&
      eligibility.value.canPropose
  );
  const kindLabel = daoEntityKindLabel(branding.kind);
  const title = branding.name;
  const summary = branding.description?.trim() || null;
  const protocolHref = protocolPath({
    board: branding.kind,
    account: branding.kind === 'community' ? branding.daoAccountId : null,
  });

  const handleSaved = useCallback((next: DaoBranding, nextMetadata: string) => {
    setOptimistic({
      daoAccountId: next.daoAccountId,
      branding: next,
      metadata: nextMetadata,
    });
    seedDaoBrandingCache(next.daoAccountId, next);
    setEditing(false);
  }, []);

  const crest = useMemo(() => {
    if (branding.avatarUrl) {
      return (
        <img
          src={branding.avatarUrl}
          alt=""
          className="dao-portfolio-crest-image"
        />
      );
    }
    return (
      <span className="dao-portfolio-crest-fallback" aria-hidden>
        {initials(title)}
      </span>
    );
  }, [branding.avatarUrl, title]);

  return (
    <>
      <OsAppScreen
        title={title}
        subtitle={kindLabel}
        backFallbackHref={APP_DAOS_PATH}
        glassChrome
        actions={
          canEdit ? (
            <OsIconAction
              ariaLabel="Edit DAO profile"
              onClick={() => setEditing(true)}
            >
              <SettingsIcon className="glass-sheet-close-icon" aria-hidden />
            </OsIconAction>
          ) : null
        }
      >
        <article className="dao-portfolio-card">
          <div
            className={`dao-portfolio-cover${branding.bannerUrl ? ' has-media' : ''}`}
          >
            {branding.bannerUrl ? (
              <img
                src={branding.bannerUrl}
                alt=""
                className="dao-portfolio-cover-image"
              />
            ) : (
              <span className="dao-portfolio-cover-empty" aria-hidden />
            )}
          </div>

          <div className="dao-portfolio-identity">
            <div className="dao-portfolio-crest" aria-hidden>
              {crest}
            </div>
            <div className="dao-portfolio-identity-copy">
              <p className="dao-portfolio-kind">{kindLabel}</p>
              <h1 className="dao-portfolio-name">{title}</h1>
              <p className="dao-portfolio-handle">{branding.daoAccountId}</p>
              {summary ? (
                <p className="dao-portfolio-bio">{summary}</p>
              ) : null}
            </div>
          </div>

          <div className="dao-portfolio-actions">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="button"
                variant="primary"
                ready
                onClick={() => {
                  router.push(protocolHref);
                }}
              >
                Open in Protocol
              </OsSheetAction>
            </OsSheetActions>
            <div className="dao-portfolio-secondary-links">
              <Link href={protocolHref} className="dao-portfolio-text-link">
                Proposals board
              </Link>
              <Link href={APP_GROUPS_PATH} className="dao-portfolio-text-link">
                Communities
              </Link>
            </div>
          </div>

          <Divider variant="section" className="dao-portfolio-divider" />

          <section className="dao-portfolio-facts" aria-label="DAO facts">
            <h2 className="dao-portfolio-facts-title">About</h2>
            <dl className="dao-portfolio-facts-list">
              <div>
                <dt>Account</dt>
                <dd>{branding.daoAccountId}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{kindLabel}</dd>
              </div>
              {configName ? (
                <div>
                  <dt>On-chain name</dt>
                  <dd>{configName}</dd>
                </div>
              ) : null}
              {configPurpose ? (
                <div>
                  <dt>On-chain purpose</dt>
                  <dd>{configPurpose}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </article>
      </OsAppScreen>

      <DaoEditSheet
        open={editing}
        daoAccountId={branding.daoAccountId}
        branding={branding}
        configName={configName ?? branding.name}
        configPurpose={configPurpose ?? branding.description ?? ''}
        configMetadata={metadata}
        onClose={() => setEditing(false)}
        onSaved={handleSaved}
      />
    </>
  );
}
