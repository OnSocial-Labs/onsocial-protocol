'use client';

/**
 * DAO org tools on the person portfolio face — quiet standing-style row + overlays.
 * Replaces the separate `/dao` workspace shell.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { rememberCommunityDao } from '@/features/protocol/dao-accounts';
import type { DaoBranding } from '@/features/protocol/dao-branding';
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
import { buildDaoClaimSupportProposalPayload } from '@/features/protocol/dao-claim-support';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePortfolioMoodPreview } from '@/contexts/portfolio-mood-preview-context';
import { rememberDaoStandingTarget } from '@/lib/dao-standing-account';
import { seedDaoBrandingCache } from '@/lib/dao-shell-cache';
import { formatSocialCompact } from '@/lib/format-social-balance';
import { fetchProfileSupportBalanceYocto } from '@/lib/social-spend-profile';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';
import {
  PROTOCOL_PROPOSAL_PARAM,
  PROTOCOL_SEARCH_PARAM,
  PROTOCOL_STATUS_PARAM,
} from '@/lib/app-routes';

type PortfolioOverlay =
  | 'manage'
  | 'members'
  | 'treasury'
  | 'proposals'
  | 'edit'
  | null;

type OptimisticDaoProfile = {
  daoAccountId: string;
  branding: DaoBranding;
  metadata: string;
};

type EligibilitySnapshot = {
  key: string;
  value: ProtocolGovernanceEligibility;
};

export type PortfolioDaoOrgChromeProps = {
  daoAccountId: string;
  daoName: string;
  initialBranding: DaoBranding | null;
  configName: string | null;
  configPurpose: string | null;
  configMetadata: string;
};

function eligibilityKey(accountId: string, daoAccountId: string): string {
  return `${accountId}:${daoAccountId}`;
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

function PortfolioDaoOrgChromeInner({
  daoAccountId,
  daoName,
  initialBranding,
  configName,
  configPurpose,
  configMetadata,
}: PortfolioDaoOrgChromeProps) {
  const searchParams = useSearchParams();
  const { accountId, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const {
    registerDaoStakeRequest,
    unregisterDaoStakeRequest,
    requestOpenMoodSheet,
  } = usePortfolioMoodPreview();
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
  const [claimableYocto, setClaimableYocto] = useState<bigint | null>(null);
  const [claimPending, setClaimPending] = useState(false);
  const [claimConfirmOpen, setClaimConfirmOpen] = useState(false);

  const branding: DaoBranding | null =
    optimistic?.daoAccountId === daoAccountId && optimistic
      ? optimistic.branding
      : initialBranding;
  const metadata =
    optimistic?.daoAccountId === daoAccountId
      ? optimistic.metadata
      : configMetadata;
  const title = branding?.name?.trim() || daoName;

  useEffect(() => {
    if (branding) {
      seedDaoBrandingCache(daoAccountId, branding);
    }
  }, [branding, daoAccountId]);

  useEffect(() => {
    rememberDaoStandingTarget(daoAccountId);
    if (branding?.kind === 'community') {
      rememberCommunityDao(daoAccountId);
    }
  }, [branding?.kind, daoAccountId]);

  useEffect(() => {
    softIndexDaoMemberships(daoAccountId);
  }, [daoAccountId]);

  useEffect(() => {
    if (!hasProposalsDeepLink(searchParams)) return;
    queueMicrotask(() => {
      setOverlay((current) => (current == null ? 'proposals' : current));
    });
  }, [searchParams]);

  useEffect(() => {
    if (!accountId) return;
    const key = eligibilityKey(accountId, daoAccountId);
    let cancelled = false;
    void getProtocolGovernanceEligibility(accountId, daoAccountId).then(
      (next) => {
        if (!cancelled) setEligibility({ key, value: next });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [accountId, daoAccountId]);

  useEffect(() => {
    let cancelled = false;
    void fetchProfileSupportBalanceYocto(daoAccountId, { fresh: true })
      .then((next) => {
        if (!cancelled) setClaimableYocto(next);
      })
      .catch(() => {
        if (!cancelled) setClaimableYocto(0n);
      });
    return () => {
      cancelled = true;
    };
  }, [daoAccountId]);

  const openStakeFromFace = useCallback(() => {
    setOverlay('proposals');
    setToolRequest('stake');
  }, []);

  useEffect(() => {
    registerDaoStakeRequest(openStakeFromFace);
    return () => unregisterDaoStakeRequest();
  }, [openStakeFromFace, registerDaoStakeRequest, unregisterDaoStakeRequest]);

  const canEdit = Boolean(
    accountId &&
      eligibility?.key === eligibilityKey(accountId, daoAccountId) &&
      eligibility.value.canPropose
  );
  const liveEligibility =
    accountId && eligibility?.key === eligibilityKey(accountId, daoAccountId)
      ? eligibility.value
      : null;
  const claimSupportLabel =
    canEdit && claimableYocto != null && claimableYocto > 0n
      ? formatSocialCompact(claimableYocto.toString())
      : null;

  const handleSaved = useCallback((next: DaoBranding, nextMetadata: string) => {
    setOptimistic({
      daoAccountId: next.daoAccountId,
      branding: next,
      metadata: nextMetadata,
    });
    seedDaoBrandingCache(next.daoAccountId, next);
    setOverlay(null);
  }, []);

  const handleClaimSupport = useCallback(async () => {
    if (claimPending || !claimableYocto || claimableYocto <= 0n) return;
    setClaimPending(true);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const amountLabel = formatSocialCompact(claimableYocto.toString());
      const payload = buildDaoClaimSupportProposalPayload({
        daoLabel: title,
        amountLabel,
      });
      const response = await submitProtocolProposal({
        daoAccountId,
        accountId: signerId,
        wallet,
        payload,
      });
      const confirmed = await trackTransaction({
        txHashes: response.txHashes,
        submittedMessage: txToastGovPending.actionSubmitted('Claim support'),
        successMessage:
          txToastGovSuccess.actionConfirmed('Claim support proposal') +
          ' Approve to collect.',
        failureMessage: txToastGovError.actionFailed('Claim support proposal'),
      });
      if (confirmed) {
        setClaimConfirmOpen(false);
        setOverlay(null);
      }
    } catch (cause) {
      if (!isWalletUserCancellation(cause)) {
        setTxResult({
          type: 'error',
          msg:
            cause instanceof Error
              ? cause.message
              : txToastGovError.actionFailed('Claim support proposal'),
        });
      }
    } finally {
      setClaimPending(false);
    }
  }, [
    claimPending,
    claimableYocto,
    daoAccountId,
    getSigningWallet,
    setTxResult,
    title,
    trackTransaction,
  ]);

  const handleManageAction = useCallback(
    (action: DaoManageAction) => {
      if (action === 'edit') {
        setOverlay('edit');
        return;
      }
      if (action === 'propose-mood') {
        setOverlay(null);
        requestOpenMoodSheet();
        return;
      }
      if (action === 'claim-support') {
        setOverlay(null);
        setClaimConfirmOpen(true);
        return;
      }
      // Propose / Stake / Settings / Info live on the proposals workspace.
      setOverlay('proposals');
      setToolRequest(action);
    },
    [requestOpenMoodSheet]
  );

  const tools = [
    { id: 'proposals' as const, label: 'Proposals' },
    { id: 'members' as const, label: 'Members' },
    { id: 'treasury' as const, label: 'Treasury' },
    { id: 'manage' as const, label: 'Manage' },
  ];

  return (
    <>
      <p className="portfolio-stats-inline" aria-label="DAO tools">
        {tools.map((tool, index) => (
          <span key={tool.id} className="portfolio-stats-item">
            {index > 0 ? (
              <span className="portfolio-stats-sep" aria-hidden>
                ·
              </span>
            ) : null}
            <button
              type="button"
              className="portfolio-stats-link"
              onClick={() => setOverlay(tool.id)}
            >
              {tool.label}
            </button>
          </span>
        ))}
      </p>

      <DaoManageSheet
        open={overlay === 'manage'}
        daoName={title}
        canEdit={canEdit}
        claimSupportLabel={claimSupportLabel}
        claimSupportPending={claimPending}
        onClose={() =>
          setOverlay((current) => (current === 'manage' ? null : current))
        }
        onAction={handleManageAction}
      />

      <DaoProposeConfirmSheet
        open={claimConfirmOpen}
        title="Propose claim support?"
        body={
          claimSupportLabel
            ? `Submit a proposal to collect ${claimSupportLabel} from the Support pot into the DAO wallet.`
            : 'Submit a proposal to collect Support into the DAO wallet.'
        }
        eligibility={liveEligibility}
        eligibilityLoading={Boolean(accountId) && !liveEligibility}
        pending={claimPending}
        proposeLabel="Propose"
        onDiscard={() => setClaimConfirmOpen(false)}
        onPropose={() => {
          void handleClaimSupport();
        }}
        onStake={() => {
          setClaimConfirmOpen(false);
          openStakeFromFace();
        }}
      />

      <DaoProposalsSheet
        open={overlay === 'proposals'}
        daoAccountId={daoAccountId}
        daoName={title}
        toolRequest={toolRequest}
        onToolRequestHandled={() => setToolRequest(null)}
        onClose={() =>
          setOverlay((current) => (current === 'proposals' ? null : current))
        }
      />

      <DaoMembersSheet
        open={overlay === 'members'}
        daoAccountId={daoAccountId}
        daoName={title}
        onClose={() =>
          setOverlay((current) => (current === 'members' ? null : current))
        }
      />

      <DaoTreasurySheet
        open={overlay === 'treasury'}
        daoAccountId={daoAccountId}
        daoName={title}
        onClose={() =>
          setOverlay((current) => (current === 'treasury' ? null : current))
        }
      />

      {branding ? (
        <DaoEditSheet
          open={overlay === 'edit'}
          daoAccountId={daoAccountId}
          branding={branding}
          configName={configName ?? branding.name}
          configPurpose={configPurpose ?? branding.description ?? ''}
          configMetadata={metadata}
          onClose={() =>
            setOverlay((current) => (current === 'edit' ? null : current))
          }
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}

/** Suspense boundary for `useSearchParams` deep-links. */
export function PortfolioDaoOrgChrome(props: PortfolioDaoOrgChromeProps) {
  return (
    <Suspense
      fallback={
        <p className="portfolio-stats-inline" aria-hidden>
          <span className="portfolio-stats-text">Proposals</span>
        </p>
      }
    >
      <PortfolioDaoOrgChromeInner {...props} />
    </Suspense>
  );
}
