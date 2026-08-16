'use client';

/**
 * DAO portfolio — presence (cover + square crest).
 * Proposals / Members / Treasury / Manage open overlays.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Divider } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { rememberCommunityDao } from '@/features/protocol/dao-accounts';
import {
  daoEntityKindLabel,
  type DaoBranding,
} from '@/features/protocol/dao-branding';
import { DaoEditSheet } from '@/features/protocol/dao-edit-sheet';
import {
  DaoManageSheet,
  type DaoManageAction,
} from '@/features/protocol/dao-manage-sheet';
import { DaoMembersSheet } from '@/features/protocol/dao-members-sheet';
import { DaoProposalsSheet } from '@/features/protocol/dao-proposals-sheet';
import { DaoTreasurySheet } from '@/features/protocol/dao-treasury-sheet';
import type { DaoWorkspaceTool } from '@/features/protocol/dao-workspace-panel';
import {
  getProtocolGovernanceEligibility,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { softIndexDaoMemberships } from '@/features/protocol/my-daos-client';
import { seedDaoBrandingCache } from '@/lib/dao-shell-cache';
import { initials } from '@/lib/profile-display';
import {
  GOVERNANCE_DAO_ACCOUNT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import {
  APP_DAOS_PATH,
  PROTOCOL_PROPOSAL_PARAM,
  PROTOCOL_SEARCH_PARAM,
  PROTOCOL_STATUS_PARAM,
  daoPath,
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

type PortfolioOverlay =
  | 'manage'
  | 'members'
  | 'treasury'
  | 'proposals'
  | 'edit'
  | null;

function eligibilityKey(accountId: string, daoAccountId: string): string {
  return `${accountId}:${daoAccountId}`;
}

function isProtocolFlipDao(daoAccountId: string): boolean {
  const id = daoAccountId.trim().toLowerCase();
  return (
    id === GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase() ||
    id === TREASURY_DAO_ACCOUNT.trim().toLowerCase()
  );
}

function hasProposalsDeepLink(searchParams: {
  get(name: string): string | null;
}): boolean {
  return Boolean(
    searchParams.get(PROTOCOL_PROPOSAL_PARAM)?.trim() ||
      searchParams.get(PROTOCOL_STATUS_PARAM)?.trim() ||
      searchParams.get(PROTOCOL_SEARCH_PARAM)?.trim()
  );
}

export function DaoPortfolioPanel({
  initialBranding,
  configName,
  configPurpose,
  configMetadata,
}: DaoPortfolioPanelProps) {
  const searchParams = useSearchParams();
  const { accountId } = useAppWallet();
  const [optimistic, setOptimistic] = useState<OptimisticDaoProfile | null>(
    null
  );
  const [overlay, setOverlay] = useState<PortfolioOverlay>(() =>
    hasProposalsDeepLink(searchParams) ? 'proposals' : null
  );
  const [toolRequest, setToolRequest] = useState<DaoWorkspaceTool>(null);
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
    if (!hasProposalsDeepLink(searchParams)) return;
    queueMicrotask(() => {
      setOverlay((current) => (current == null ? 'proposals' : current));
    });
  }, [searchParams]);

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
  const showFlipper = isProtocolFlipDao(branding.daoAccountId);
  const isGovernance =
    branding.daoAccountId.trim().toLowerCase() ===
    GOVERNANCE_DAO_ACCOUNT.trim().toLowerCase();

  const handleSaved = useCallback((next: DaoBranding, nextMetadata: string) => {
    setOptimistic({
      daoAccountId: next.daoAccountId,
      branding: next,
      metadata: nextMetadata,
    });
    seedDaoBrandingCache(next.daoAccountId, next);
    setOverlay(null);
  }, []);

  const handleManageAction = useCallback((action: DaoManageAction) => {
    if (action === 'edit') {
      setOverlay('edit');
      return;
    }
    if (action === 'members') {
      setOverlay('members');
      return;
    }
    if (action === 'treasury') {
      setOverlay('treasury');
      return;
    }
    // Propose / Stake / Settings / Info live on the proposals workspace.
    setOverlay('proposals');
    setToolRequest(action);
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

          {showFlipper ? (
            <div
              className="protocol-board-rail dao-portfolio-controls"
              role="tablist"
              aria-label="Protocol DAO"
            >
              <Link
                href={daoPath(GOVERNANCE_DAO_ACCOUNT)}
                role="tab"
                aria-selected={isGovernance}
                className={`protocol-board-chip${isGovernance ? ' is-active' : ''}`}
              >
                Governance
              </Link>
              <Link
                href={daoPath(TREASURY_DAO_ACCOUNT)}
                role="tab"
                aria-selected={!isGovernance}
                className={`protocol-board-chip${!isGovernance ? ' is-active' : ''}`}
              >
                Treasury
              </Link>
            </div>
          ) : null}

          <div
            className="protocol-tools dao-portfolio-controls"
            role="toolbar"
            aria-label="DAO entry"
          >
            <button
              type="button"
              className="protocol-tool"
              onClick={() => setOverlay('proposals')}
            >
              Proposals
            </button>
            <button
              type="button"
              className="protocol-tool"
              onClick={() => setOverlay('members')}
            >
              Members
            </button>
            <button
              type="button"
              className="protocol-tool"
              onClick={() => setOverlay('treasury')}
            >
              Treasury
            </button>
            <button
              type="button"
              className="protocol-tool"
              onClick={() => setOverlay('manage')}
            >
              Manage
            </button>
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

      <DaoManageSheet
        open={overlay === 'manage'}
        daoName={title}
        canEdit={canEdit}
        onClose={() =>
          setOverlay((current) => (current === 'manage' ? null : current))
        }
        onAction={handleManageAction}
      />

      <DaoProposalsSheet
        open={overlay === 'proposals'}
        daoAccountId={branding.daoAccountId}
        daoName={title}
        toolRequest={toolRequest}
        onToolRequestHandled={() => setToolRequest(null)}
        onClose={() =>
          setOverlay((current) => (current === 'proposals' ? null : current))
        }
      />

      <DaoMembersSheet
        open={overlay === 'members'}
        daoAccountId={branding.daoAccountId}
        daoName={title}
        onClose={() =>
          setOverlay((current) => (current === 'members' ? null : current))
        }
      />

      <DaoTreasurySheet
        open={overlay === 'treasury'}
        daoAccountId={branding.daoAccountId}
        daoName={title}
        onClose={() =>
          setOverlay((current) => (current === 'treasury' ? null : current))
        }
      />

      <DaoEditSheet
        open={overlay === 'edit'}
        daoAccountId={branding.daoAccountId}
        branding={branding}
        configName={configName ?? branding.name}
        configPurpose={configPurpose ?? branding.description ?? ''}
        configMetadata={metadata}
        onClose={() =>
          setOverlay((current) => (current === 'edit' ? null : current))
        }
        onSaved={handleSaved}
      />
    </>
  );
}
