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
import { DaoBoostSheet } from '@/features/protocol/dao-boost-sheet';
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
  viewerCanProposeOnDao,
  type ProtocolGovernanceEligibility,
} from '@/features/protocol/protocol-eligibility';
import { softIndexDaoMemberships } from '@/features/protocol/my-daos-client';
import {
  bumpDaoWorkspacePrefetch,
  scheduleDaoWorkspacePrefetch,
} from '@/lib/dao-workspace-prefetch';
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
  | 'boost'
  | null;

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

  const title = initialBranding?.name?.trim() || daoName;

  useEffect(() => {
    if (initialBranding) {
      seedDaoBrandingCache(daoAccountId, initialBranding);
    }
  }, [initialBranding, daoAccountId]);

  useEffect(() => {
    rememberDaoStandingTarget(daoAccountId);
    if (initialBranding?.kind === 'community') {
      rememberCommunityDao(daoAccountId);
    }
  }, [initialBranding?.kind, daoAccountId]);

  useEffect(() => {
    softIndexDaoMemberships(daoAccountId);
    return scheduleDaoWorkspacePrefetch(daoAccountId);
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
      viewerCanProposeOnDao(eligibility.value)
  );
  const liveEligibility =
    accountId && eligibility?.key === eligibilityKey(accountId, daoAccountId)
      ? eligibility.value
      : null;
  const claimSupportLabel =
    canEdit && claimableYocto != null && claimableYocto > 0n
      ? formatSocialCompact(claimableYocto.toString())
      : null;

  const handleProposed = useCallback(() => {
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
        bumpDaoWorkspacePrefetch(daoAccountId);
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
      if (action === 'boost') {
        setOverlay('boost');
        return;
      }
      // Propose / Stake / Settings / Info live on the proposals workspace.
      setOverlay('proposals');
      setToolRequest(action as DaoWorkspaceTool);
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
      <nav className="portfolio-dao-tools-inline" aria-label="DAO tools">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="portfolio-dao-tools-link"
            onClick={() => setOverlay(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </nav>

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
        onRequestStake={openStakeFromFace}
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

      {initialBranding ? (
        <DaoEditSheet
          open={overlay === 'edit'}
          daoAccountId={daoAccountId}
          branding={initialBranding}
          configName={configName ?? initialBranding.name}
          configPurpose={configPurpose ?? initialBranding.description ?? ''}
          configMetadata={configMetadata}
          onClose={() =>
            setOverlay((current) => (current === 'edit' ? null : current))
          }
          onProposed={handleProposed}
        />
      ) : null}

      <DaoBoostSheet
        open={overlay === 'boost'}
        daoAccountId={daoAccountId}
        daoName={title}
        eligibility={liveEligibility}
        eligibilityLoading={Boolean(accountId) && !liveEligibility}
        onClose={() =>
          setOverlay((current) => (current === 'boost' ? null : current))
        }
        onRequestStake={openStakeFromFace}
      />
    </>
  );
}

/** Suspense boundary for `useSearchParams` deep-links. */
export function PortfolioDaoOrgChrome(props: PortfolioDaoOrgChromeProps) {
  return (
    <Suspense
      fallback={
        <nav className="portfolio-dao-tools-inline" aria-hidden>
          <span className="portfolio-dao-tools-link">Proposals</span>
        </nav>
      }
    >
      <PortfolioDaoOrgChromeInner {...props} />
    </Suspense>
  );
}
