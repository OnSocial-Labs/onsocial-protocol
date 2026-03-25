'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PageShell } from '@/components/layout/page-shell';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { useWallet } from '@/contexts/wallet-context';
import {
  claimApiKey,
  checkStatus,
  depositGovernanceTokens,
  recordProposalSubmission,
  registerGovernanceAccount,
  selfDelegateGovernanceTokens,
  submitApplication,
  submitDirectGovernanceProposal,
} from '@/features/partners/api';
import { ApplicationForm } from '@/features/partners/application-form';
import { STEPS } from '@/features/partners/constants';
import {
  ApprovedDashboard,
  GovernanceEligibilityState,
  PendingState,
  RejectedState,
} from '@/features/partners/states';
import type {
  AppRegistration,
  ApplicationFormData,
  GovernanceProposal,
  Step,
} from '@/features/partners/types';
import { getGovernanceEligibility } from '@/lib/near-rpc';
import { StepIndicator } from '@/features/partners/ui-helpers';

export default function PartnersPage() {
  const { accountId, wallet } = useWallet();
  const [step, setStep] = useState<Step>('apply');
  const [registration, setRegistration] = useState<AppRegistration | null>(
    null
  );
  const [pendingApp, setPendingApp] = useState<{
    appId: string;
    label: string;
    proposal: GovernanceProposal | null;
  } | null>(null);
  const [pageError, setPageError] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposalSubmitting, setProposalSubmitting] = useState(false);
  const [claimingKey, setClaimingKey] = useState(false);
  const [governanceEligibility, setGovernanceEligibility] = useState<Awaited<
    ReturnType<typeof getGovernanceEligibility>
  > | null>(null);
  const [governanceActionLabel, setGovernanceActionLabel] = useState('');
  const autoClaimedAppRef = useRef<string | null>(null);

  const resetState = useCallback(() => {
    setStep('apply');
    setRegistration(null);
    setPendingApp(null);
    setPageError('');
    setLoading(false);
    setProposalSubmitting(false);
    setClaimingKey(false);
    setGovernanceEligibility(null);
    setGovernanceActionLabel('');
    autoClaimedAppRef.current = null;
  }, []);

  const refreshGovernanceEligibility = useCallback(async () => {
    if (!accountId) {
      setGovernanceEligibility(null);
      return;
    }

    const snapshot = await getGovernanceEligibility(accountId);
    setGovernanceEligibility(snapshot);
  }, [accountId]);

  const handleClaimApiKey = useCallback(async () => {
    if (!wallet || !accountId || !pendingApp) {
      setPageError('Reconnect the approved wallet to reveal the API key');
      return;
    }

    setClaimingKey(true);
    setPageError('');

    try {
      const result = await claimApiKey(wallet, accountId);
      if (!result.app_id || !result.api_key) {
        throw new Error('Backend did not return an API key');
      }

      setRegistration({
        appId: result.app_id,
        apiKey: result.api_key,
        label: result.label ?? pendingApp.label,
      });
      setPendingApp(null);
      setStep('approved');
    } catch (err) {
      autoClaimedAppRef.current = null;
      setPageError(
        err instanceof Error ? err.message : 'Failed to reveal API key'
      );
      setStep('claiming');
    } finally {
      setClaimingKey(false);
    }
  }, [accountId, pendingApp, wallet]);

  const refreshStatus = useCallback(async () => {
    if (!accountId) {
      return;
    }

    const data = await checkStatus(accountId);

    if (data.status === 'approved') {
      setRegistration(null);
      setPendingApp({
        appId: data.app_id!,
        label: data.label!,
        proposal: data.governance_proposal ?? null,
      });
      setStep('claiming');
      return;
    }

    if (
      data.status === 'proposal_submitted' ||
      data.status === 'ready_for_governance' ||
      data.status === 'pending'
    ) {
      setPendingApp({
        appId: data.app_id!,
        label: data.label!,
        proposal: data.governance_proposal ?? null,
      });
      setStep(
        data.status === 'proposal_submitted'
          ? 'governance'
          : data.status === 'ready_for_governance'
            ? 'eligibility'
            : 'pending'
      );
      return;
    }

    if (data.status === 'rejected') {
      setPendingApp({
        appId: data.app_id!,
        label: data.label!,
        proposal: data.governance_proposal ?? null,
      });
      setStep('rejected');
      return;
    }

    setPendingApp(null);
    setRegistration(null);
    setGovernanceEligibility(null);
    setStep('apply');
  }, [accountId]);

  useEffect(() => {
    if (step !== 'claiming' || !pendingApp?.appId) {
      return;
    }

    if (autoClaimedAppRef.current === pendingApp.appId) {
      return;
    }

    autoClaimedAppRef.current = pendingApp.appId;
    handleClaimApiKey().catch(() => {
      autoClaimedAppRef.current = null;
    });
  }, [handleClaimApiKey, pendingApp, step]);

  useEffect(() => {
    if (!accountId) {
      const timeoutId = window.setTimeout(() => {
        resetState();
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });

    refreshStatus()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, refreshStatus, resetState]);

  useEffect(() => {
    if (
      !accountId ||
      (step !== 'governance' && step !== 'pending' && step !== 'eligibility')
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      refreshStatus().catch(() => {});
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [accountId, refreshStatus, step]);

  useEffect(() => {
    if (!accountId || step !== 'eligibility') {
      return;
    }

    refreshGovernanceEligibility().catch(() => {});
  }, [accountId, refreshGovernanceEligibility, step]);

  const handleApply = useCallback(
    async (data: ApplicationFormData) => {
      if (!accountId) throw new Error('Wallet not connected');

      setPageError('');
      setStep('submitting');

      try {
        const result = await submitApplication({
          app_id: data.appId,
          label: data.label,
          description: data.description,
          audience_band: data.audienceBand,
          wallet_id: accountId,
          website_url: data.websiteUrl,
          telegram_handle: data.telegramHandle,
          x_handle: data.xHandle,
        });

        setPendingApp({
          appId: result.app_id,
          label: result.label,
          proposal: result.governance_proposal ?? null,
        });
        setStep(
          result.status === 'ready_for_governance' ? 'eligibility' : 'pending'
        );
      } catch (err) {
        setPageError(err instanceof Error ? err.message : 'Application failed');
        setStep('apply');
      }
    },
    [accountId]
  );

  const handleSubmitProposal = useCallback(async () => {
    if (!wallet || !accountId || !pendingApp?.proposal) {
      setPageError('Wallet and governance proposal are required');
      return;
    }

    if (governanceEligibility && !governanceEligibility.canPropose) {
      setPageError(
        'This wallet does not yet have enough delegated governance weight to submit the proposal'
      );
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionLabel('');

    try {
      const { proposalId, txHash } = await submitDirectGovernanceProposal(
        wallet,
        pendingApp.proposal
      );

      if (!txHash) {
        throw new Error(
          'Wallet submitted the transaction but no tx hash was returned'
        );
      }

      const response = await recordProposalSubmission(
        pendingApp.appId,
        accountId,
        proposalId,
        txHash
      );

      setPendingApp((current) =>
        current
          ? {
              ...current,
              proposal: response.governance_proposal ?? current.proposal,
            }
          : current
      );
      setStep('governance');
      await refreshStatus();
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : 'Governance proposal failed'
      );
    } finally {
      setProposalSubmitting(false);
    }
  }, [accountId, governanceEligibility, pendingApp, refreshStatus, wallet]);

  const handleRegisterGovernance = useCallback(async () => {
    if (!wallet || !accountId || !governanceEligibility?.stakingContractId) {
      setPageError('Wallet and governance staking contract are required');
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionLabel('Registering this wallet for governance staking…');

    try {
      await registerGovernanceAccount(
        wallet,
        governanceEligibility.stakingContractId,
        accountId,
        governanceEligibility.storageDeposit
      );
      await refreshGovernanceEligibility();
      setGovernanceActionLabel('Governance registration complete.');
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : 'Governance registration failed'
      );
    } finally {
      setProposalSubmitting(false);
    }
  }, [accountId, governanceEligibility, refreshGovernanceEligibility, wallet]);

  const handleDepositGovernance = useCallback(async () => {
    if (!wallet || !governanceEligibility?.stakingContractId) {
      setPageError('Wallet and governance staking contract are required');
      return;
    }

    if (governanceEligibility.depositNeeded === '0') {
      await refreshGovernanceEligibility();
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionLabel('Depositing SOCIAL into governance staking…');

    try {
      await depositGovernanceTokens(
        wallet,
        governanceEligibility.stakingContractId,
        governanceEligibility.depositNeeded
      );
      await refreshGovernanceEligibility();
      setGovernanceActionLabel('Governance staking deposit complete.');
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : 'Governance deposit failed'
      );
    } finally {
      setProposalSubmitting(false);
    }
  }, [governanceEligibility, refreshGovernanceEligibility, wallet]);

  const handleDelegateGovernance = useCallback(async () => {
    if (!wallet || !accountId || !governanceEligibility?.stakingContractId) {
      setPageError('Wallet and governance staking contract are required');
      return;
    }

    if (governanceEligibility.delegateNeeded === '0') {
      await refreshGovernanceEligibility();
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionLabel('Self-delegating governance voting weight…');

    try {
      await selfDelegateGovernanceTokens(
        wallet,
        governanceEligibility.stakingContractId,
        accountId,
        governanceEligibility.delegateNeeded
      );
      await refreshGovernanceEligibility();
      setGovernanceActionLabel('Governance self-delegation complete.');
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : 'Governance self-delegation failed'
      );
    } finally {
      setProposalSubmitting(false);
    }
  }, [accountId, governanceEligibility, refreshGovernanceEligibility, wallet]);

  const currentStep =
    step === 'apply' || step === 'submitting'
      ? 0
      : step === 'pending' || step === 'eligibility' || step === 'governance'
        ? 1
        : step === 'claiming' || step === 'approved'
          ? 2
          : 0;

  return (
    <PageShell className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 px-2 py-4 text-center md:py-6"
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70 blur-3xl"
          style={{
            background:
              'radial-gradient(circle at 50% 20%, rgba(96,165,250,0.18), transparent 45%), radial-gradient(circle at 75% 25%, rgba(74,222,128,0.12), transparent 38%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl">
          <h1 className="mb-3 text-4xl font-bold tracking-[-0.03em] md:text-5xl">
            Grow together
            <br />
            <span className="portal-green-text">With SOCIAL</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            Create shared value across your community, app, or ecosystem.
          </p>
        </div>
      </motion.div>

      <div className="mb-8 rounded-[1.5rem] border border-border/50 bg-background/30 px-4 py-5 md:px-6">
        <StepIndicator steps={STEPS} current={currentStep} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-[1.5rem] border border-border/50 bg-background/40 p-5 md:p-8"
      >
        {loading && (
          <div className="text-center py-12">
            <div className="portal-blue-text mb-4">
              <PulsingDots size="lg" />
            </div>
            <p className="text-sm text-muted-foreground">
              Checking application status…
            </p>
          </div>
        )}
        {!loading && step === 'apply' && (
          <ApplicationForm onSubmit={handleApply} />
        )}
        {!loading && step === 'apply' && pageError && (
          <p className="portal-red-panel portal-red-text rounded-lg px-4 py-2 mt-4 text-center text-sm">
            {pageError}
          </p>
        )}
        {step === 'submitting' && (
          <div className="text-center py-12">
            <div className="portal-blue-text mb-4">
              <PulsingDots size="lg" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Sending your application…
            </h3>
          </div>
        )}
        {step === 'claiming' && pendingApp && (
          <div className="text-center py-12">
            <div className="portal-green-text mb-4">
              <PulsingDots size="lg" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Reveal your API key</h3>
            <p className="mx-auto mb-4 max-w-lg text-sm text-muted-foreground">
              {claimingKey
                ? 'A wallet signature request is open to reveal the API key for this approved app.'
                : 'This app is approved. A quick wallet confirmation reveals the API key.'}
            </p>
            {pageError && (
              <p className="portal-red-text mx-auto mb-4 max-w-xl text-sm">
                {pageError}
              </p>
            )}
            {!claimingKey && (
              <button
                type="button"
                onClick={() => {
                  autoClaimedAppRef.current = null;
                  handleClaimApiKey().catch(() => {});
                }}
                className="portal-green-panel inline-flex items-center justify-center rounded-full border px-5 py-2 text-sm font-medium"
              >
                Reveal Key
              </button>
            )}
          </div>
        )}
        {step === 'pending' && pendingApp && (
          <PendingState
            appId={pendingApp.appId}
            label={pendingApp.label}
            phase="review"
            proposal={pendingApp.proposal}
            actionError={pageError}
          />
        )}
        {step === 'eligibility' && pendingApp && (
          <GovernanceEligibilityState
            appId={pendingApp.appId}
            label={pendingApp.label}
            eligibility={governanceEligibility}
            acting={proposalSubmitting}
            actionLabel={governanceActionLabel}
            actionError={pageError}
            onRefresh={() => {
              setPageError('');
              setGovernanceActionLabel('Refreshing governance eligibility…');
              return refreshGovernanceEligibility().finally(() => {
                setGovernanceActionLabel('');
              });
            }}
            onRegister={handleRegisterGovernance}
            onDeposit={handleDepositGovernance}
            onDelegate={handleDelegateGovernance}
            onSubmitProposal={
              governanceEligibility?.canPropose
                ? handleSubmitProposal
                : undefined
            }
          />
        )}
        {step === 'governance' && pendingApp && (
          <PendingState
            appId={pendingApp.appId}
            label={pendingApp.label}
            phase={
              pendingApp.proposal?.status === 'submitted'
                ? 'governance'
                : 'ready'
            }
            proposal={pendingApp.proposal}
            acting={proposalSubmitting}
            actionError={pageError}
            onSubmitProposal={
              pendingApp.proposal?.status === 'submitted'
                ? undefined
                : handleSubmitProposal
            }
          />
        )}
        {step === 'rejected' && pendingApp && (
          <RejectedState appId={pendingApp.appId} label={pendingApp.label} />
        )}
        {step === 'approved' && registration && (
          <ApprovedDashboard
            registration={registration}
            onKeyRotated={(newKey) =>
              setRegistration((prev) =>
                prev ? { ...prev, apiKey: newKey } : prev
              )
            }
          />
        )}
      </motion.div>
    </PageShell>
  );
}
