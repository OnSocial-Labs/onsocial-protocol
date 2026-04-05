'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PageShell } from '@/components/layout/page-shell';
import { SecondaryPageHeader } from '@/components/layout/secondary-page-header';
import { PortalBadge } from '@/components/ui/portal-badge';
import { FormSkeleton, PanelSkeleton } from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import {
  buildGovernanceDelegationPlan,
  cancelApplication,
  claimApiKey,
  checkStatus,
  prepareGovernanceDelegation,
  registerGovernanceAccount,
  recordProposalSubmission,
  submitApplication,
  submitDirectGovernanceProposal,
  withdrawGovernanceTokens,
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
  ApplicationFormPrefill,
  GovernanceProposal,
  Step,
} from '@/features/partners/types';
import {
  getGovernanceEligibility,
  getGovernanceProposalBond,
  getGovernanceProposalThreshold,
  type GovernanceEligibilitySnapshot,
  yoctoToNear,
  yoctoToSocial,
} from '@/lib/near-rpc';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { StepIndicator } from '@/features/partners/ui-helpers';

export default function PartnersPage() {
  type GovernanceEligibilityReady = GovernanceEligibilitySnapshot & {
    stakingContractId: string;
  };

  const formatNearDisplay = useCallback((value: string) => {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return '0';
    }

    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: numeric >= 10 ? 2 : 4,
    }).format(numeric);
  }, []);

  const toApplicationFormPrefill = useCallback(
    (data: ApplicationFormData): ApplicationFormPrefill => ({
      appId: data.appId,
      label: data.label,
      description: data.description,
      audienceBand: data.audienceBand,
      websiteUrl: data.websiteUrl,
      telegramHandle: data.telegramHandle,
      xHandle: data.xHandle,
    }),
    []
  );

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
  const [refreshingGovernanceEligibility, setRefreshingGovernanceEligibility] =
    useState(false);
  const [governanceActionKind, setGovernanceActionKind] = useState<
    'prepare' | 'submit' | 'cancel' | 'withdraw' | null
  >(null);
  const [governanceThresholdDisplay, setGovernanceThresholdDisplay] =
    useState('100');
  const [governanceProposalBond, setGovernanceProposalBond] = useState('0');
  const [governanceProposalBondDisplay, setGovernanceProposalBondDisplay] =
    useState('1');
  const [applicationFormPrefill, setApplicationFormPrefill] =
    useState<ApplicationFormPrefill | null>(null);
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);

  const resetState = useCallback(() => {
    setStep('apply');
    setRegistration(null);
    setPendingApp(null);
    setPageError('');
    setLoading(false);
    setProposalSubmitting(false);
    setClaimingKey(false);
    setGovernanceEligibility(null);
    setRefreshingGovernanceEligibility(false);
    setGovernanceActionKind(null);
    setApplicationFormPrefill(null);
    clearTxResult();
  }, [clearTxResult]);

  const refreshGovernanceEligibility = useCallback(async () => {
    if (!accountId) {
      setGovernanceEligibility(null);
      return null;
    }

    const snapshot = await getGovernanceEligibility(accountId);
    setGovernanceEligibility(snapshot);
    return snapshot;
  }, [accountId]);

  const requireGovernanceEligibility = useCallback(
    (
      snapshot: GovernanceEligibilitySnapshot | null,
      errorMessage: string
    ): GovernanceEligibilityReady => {
      if (!snapshot?.stakingContractId) {
        throw new Error(errorMessage);
      }

      return snapshot as GovernanceEligibilityReady;
    },
    []
  );

  const handleClaimApiKey = useCallback(async () => {
    const currentApp = pendingApp ?? registration;

    if (!wallet || !accountId || !currentApp) {
      setTxResult({
        type: 'error',
        msg: 'Reconnect the approved wallet to reveal the API key',
      });
      return;
    }

    setClaimingKey(true);
    setPageError('');
    clearTxResult();

    try {
      const result = await claimApiKey(wallet, accountId);
      if (!result.app_id || !result.api_key) {
        throw new Error('Backend did not return an API key');
      }

      setRegistration({
        appId: result.app_id,
        apiKey: result.api_key,
        label: result.label ?? currentApp.label,
      });
      setPendingApp(null);
      setStep('approved');
      setTxResult({
        type: 'success',
        msg: 'API key access confirmed for this wallet.',
      });
    } catch (err) {
      setTxResult({
        type: 'error',
        msg:
          err instanceof Error && err.message === 'Action was cancelled'
            ? 'Wallet confirmation was cancelled.'
            : err instanceof Error
              ? err.message
              : 'Failed to reveal API key',
      });
      setStep('approved');
    } finally {
      setClaimingKey(false);
    }
  }, [accountId, clearTxResult, pendingApp, registration, setTxResult, wallet]);

  const refreshStatus = useCallback(async () => {
    if (!accountId) {
      return;
    }

    const data = await checkStatus(accountId);

    if (data.status === 'approved') {
      setRegistration({
        appId: data.app_id!,
        apiKey: null,
        label: data.label!,
      });
      setPendingApp(null);
      setStep('approved');
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
    setApplicationFormPrefill(data.application_form ?? null);
    setStep('apply');
  }, [accountId]);

  useEffect(() => {
    Promise.all([getGovernanceProposalThreshold(), getGovernanceProposalBond()])
      .then(([threshold, proposalBond]) => {
        setGovernanceThresholdDisplay(yoctoToSocial(threshold));
        setGovernanceProposalBond(proposalBond);
        setGovernanceProposalBondDisplay(
          formatNearDisplay(yoctoToNear(proposalBond))
        );
      })
      .catch(() => {});
  }, [formatNearDisplay]);

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

      setApplicationFormPrefill(toApplicationFormPrefill(data));
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
    [accountId, toApplicationFormPrefill]
  );

  const handleSubmitProposal = useCallback(async () => {
    if (!wallet || !accountId || !pendingApp?.proposal) {
      setTxResult({
        type: 'error',
        msg: 'Wallet and governance proposal are required',
      });
      return;
    }

    if (governanceEligibility && !governanceEligibility.canPropose) {
      setTxResult({
        type: 'error',
        msg: 'This wallet does not yet have enough delegated governance weight to submit the proposal',
      });
      return;
    }

    if (
      governanceEligibility &&
      BigInt(governanceEligibility.nearBalance) < BigInt(governanceProposalBond)
    ) {
      setTxResult({
        type: 'error',
        msg: `This wallet needs ${governanceProposalBondDisplay} NEAR available for the current DAO proposal bond.`,
      });
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionKind('submit');
    clearTxResult();

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

      const confirmed = await trackTransaction({
        txHashes: [txHash],
        submittedMessage: 'DAO proposal submitted. Confirming on-chain.',
        successMessage:
          'DAO proposal confirmed on-chain. Governance status is refreshing.',
        failureMessage: 'DAO proposal failed on-chain.',
      });

      if (!confirmed) {
        return;
      }

      let response;
      try {
        response = await recordProposalSubmission(
          pendingApp.appId,
          accountId,
          proposalId,
          txHash
        );
      } catch (error) {
        setTxResult({
          type: 'error',
          msg:
            error instanceof Error
              ? `Proposal confirmed on-chain, but backend recording failed: ${error.message}`
              : 'Proposal confirmed on-chain, but backend recording failed.',
        });
        return;
      }

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
      setTxResult({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Governance proposal failed',
      });
    } finally {
      setProposalSubmitting(false);
      setGovernanceActionKind(null);
    }
  }, [
    accountId,
    clearTxResult,
    governanceEligibility,
    governanceProposalBond,
    governanceProposalBondDisplay,
    pendingApp,
    refreshStatus,
    setTxResult,
    trackTransaction,
    wallet,
  ]);

  const handleCancelApplication = useCallback(async () => {
    if (!accountId || !pendingApp) {
      setPageError('Application details are required');
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionKind('cancel');

    try {
      await cancelApplication(pendingApp.appId, accountId);
      setPendingApp(null);
      setRegistration(null);
      setGovernanceEligibility(null);
      setGovernanceActionKind(null);
      setStep('apply');
    } catch (err) {
      setPageError(
        err instanceof Error ? err.message : 'Failed to return to the form'
      );
    } finally {
      setProposalSubmitting(false);
      setGovernanceActionKind(null);
    }
  }, [accountId, pendingApp]);

  const handlePrepareGovernance = useCallback(async () => {
    const initialEligibility = governanceEligibility;

    if (!wallet || !accountId || !initialEligibility?.stakingContractId) {
      setTxResult({
        type: 'error',
        msg: 'Wallet and governance staking contract are required',
      });
      return;
    }

    if (
      initialEligibility.isRegistered &&
      BigInt(initialEligibility.nearStorageNeeded) > 0n
    ) {
      setTxResult({
        type: 'error',
        msg: 'This governance staking account needs more prepaid NEAR storage before another delegation can be recorded.',
      });
      return;
    }

    const initialPlan = buildGovernanceDelegationPlan(
      initialEligibility,
      BigInt(initialEligibility.remainingToThreshold)
    );

    if (
      !initialEligibility.isRegistered &&
      BigInt(initialEligibility.nearBalance) <
        BigInt(initialPlan.requiredNearStorage)
    ) {
      setTxResult({
        type: 'error',
        msg: 'This wallet does not have enough NEAR to register with governance staking yet.',
      });
      return;
    }

    if (
      initialEligibility.isRegistered &&
      initialEligibility.depositNeeded === '0' &&
      initialEligibility.delegateNeeded === '0'
    ) {
      await refreshGovernanceEligibility();
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionKind('prepare');
    clearTxResult();

    try {
      let refreshedEligibility: GovernanceEligibilityReady =
        requireGovernanceEligibility(
          initialEligibility,
          'Wallet and governance staking contract are required'
        );
      let completedStep = false;
      const plan = buildGovernanceDelegationPlan(
        refreshedEligibility,
        BigInt(refreshedEligibility.remainingToThreshold)
      );

      if (BigInt(plan.targetDelegateAmount) > 0n) {
        if (plan.delegateStorageLimitReached) {
          throw new Error(
            'Undelegate an existing entry before delegating again.'
          );
        }

        if (
          refreshedEligibility.isInCooldown &&
          !plan.depositOnlyDuringCooldown
        ) {
          throw new Error('Delegation unlocks after cooldown.');
        }

        if (
          BigInt(plan.depositAmount) >
          BigInt(refreshedEligibility.walletBalance)
        ) {
          throw new Error(
            'This wallet does not have enough SOCIAL to cover that governance preparation.'
          );
        }

        if (
          BigInt(refreshedEligibility.nearBalance) <
          BigInt(plan.requiredNearStorage)
        ) {
          throw new Error(
            'This wallet does not have enough NEAR to cover governance storage yet.'
          );
        }

        const delegationTxHashes = await prepareGovernanceDelegation(
          wallet,
          refreshedEligibility.stakingContractId,
          accountId,
          {
            storageDeposit: plan.storageDeposit,
            depositAmount: plan.depositAmount,
            delegateAmount: plan.delegateAmount,
          }
        );

        if (delegationTxHashes.length === 0) {
          throw new Error(
            'Wallet submitted the governance flow, but no tx hash was returned'
          );
        }

        const delegationConfirmed = await trackTransaction({
          txHashes: delegationTxHashes,
          submittedMessage: plan.depositOnlyDuringCooldown
            ? delegationTxHashes.length > 1
              ? 'Governance deposit flow submitted. Confirm the wallet approval and on-chain settlement.'
              : 'Governance deposit submitted. Confirming on-chain.'
            : delegationTxHashes.length > 1
              ? 'Governance preparation submitted. Confirm the wallet approval and on-chain settlement.'
              : 'Governance delegation submitted. Confirming on-chain.',
          successMessage: plan.depositOnlyDuringCooldown
            ? 'Governance deposit confirmed on-chain. Delegation unlocks after cooldown.'
            : delegationTxHashes.length > 1
              ? 'Governance registration, deposit, and delegation confirmed on-chain.'
              : 'Governance delegation confirmed on-chain.',
          failureMessage: plan.depositOnlyDuringCooldown
            ? 'Governance deposit failed on-chain.'
            : delegationTxHashes.length > 1
              ? 'Governance preparation failed on-chain.'
              : 'Governance delegation failed on-chain.',
        });

        if (!delegationConfirmed) {
          return;
        }

        completedStep = true;
        refreshedEligibility = requireGovernanceEligibility(
          await refreshGovernanceEligibility(),
          'Governance preparation did not refresh correctly'
        );
      } else if (!refreshedEligibility.isRegistered) {
        const registerTxHash = await registerGovernanceAccount(
          wallet,
          refreshedEligibility.stakingContractId,
          accountId,
          refreshedEligibility.storageDeposit
        );

        if (!registerTxHash) {
          throw new Error(
            'Wallet submitted governance registration, but no tx hash was returned'
          );
        }

        const registrationConfirmed = await trackTransaction({
          txHashes: [registerTxHash],
          submittedMessage:
            'Governance registration submitted. Confirming on-chain.',
          successMessage: 'Governance registration confirmed on-chain.',
          failureMessage: 'Governance registration failed on-chain.',
        });

        if (!registrationConfirmed) {
          return;
        }

        completedStep = true;
        refreshedEligibility = requireGovernanceEligibility(
          await refreshGovernanceEligibility(),
          'Governance staking registration did not refresh correctly'
        );
      }

      if (!completedStep) {
        setTxResult({
          type: 'success',
          msg: 'Governance is already up to date.',
        });
      }
    } catch (err) {
      setTxResult({
        type: 'error',
        msg:
          err instanceof Error ? err.message : 'Governance preparation failed',
      });
    } finally {
      setProposalSubmitting(false);
      setGovernanceActionKind(null);
    }
  }, [
    accountId,
    clearTxResult,
    governanceEligibility,
    requireGovernanceEligibility,
    refreshGovernanceEligibility,
    setTxResult,
    trackTransaction,
    wallet,
  ]);

  const handleWithdrawGovernanceExcess = useCallback(async () => {
    const currentEligibility = governanceEligibility;

    if (!wallet || !accountId || !currentEligibility?.stakingContractId) {
      setTxResult({
        type: 'error',
        msg: 'Wallet and governance staking contract are required',
      });
      return;
    }

    if (currentEligibility.isInCooldown) {
      setTxResult({
        type: 'error',
        msg: 'This governance balance is still in cooldown and cannot be withdrawn yet.',
      });
      return;
    }

    if (currentEligibility.availableToWithdraw === '0') {
      await refreshGovernanceEligibility();
      return;
    }

    setPageError('');
    setProposalSubmitting(true);
    setGovernanceActionKind('withdraw');
    clearTxResult();

    try {
      const txHash = await withdrawGovernanceTokens(
        wallet,
        currentEligibility.stakingContractId,
        currentEligibility.availableToWithdraw
      );

      if (!txHash) {
        throw new Error(
          'Wallet submitted the transaction but no tx hash was returned'
        );
      }

      const confirmed = await trackTransaction({
        txHashes: [txHash],
        submittedMessage:
          'Governance withdrawal submitted. Confirming on-chain.',
        successMessage: 'Excess staked SOCIAL was withdrawn to your wallet.',
        failureMessage: 'Governance withdrawal failed on-chain.',
      });

      if (!confirmed) {
        return;
      }

      await refreshGovernanceEligibility();
    } catch (err) {
      setTxResult({
        type: 'error',
        msg:
          err instanceof Error ? err.message : 'Governance withdrawal failed',
      });
    } finally {
      setProposalSubmitting(false);
      setGovernanceActionKind(null);
    }
  }, [
    accountId,
    clearTxResult,
    governanceEligibility,
    refreshGovernanceEligibility,
    setTxResult,
    trackTransaction,
    wallet,
  ]);

  const currentStep =
    step === 'apply' || step === 'submitting'
      ? 0
      : step === 'pending' || step === 'eligibility' || step === 'governance'
        ? 1
        : step === 'claiming' || step === 'approved'
          ? 2
          : 0;
  const currentStepTitle = STEPS[currentStep]?.title ?? 'Apply';
  const currentAppLabel = registration?.label ?? pendingApp?.label ?? null;
  const currentAppId = registration?.appId ?? pendingApp?.appId ?? null;

  return (
    <PageShell className="max-w-5xl">
      <SecondaryPageHeader
        badge="Partner Programs"
        badgeAccent="green"
        glowAccents={['blue', 'green']}
        glowClassName="h-40 opacity-70"
        contentClassName="max-w-3xl"
        title="Launch community rewards with OnSocial"
        description="Add community rewards to your Telegram or dapp with OnSocial handling the reward layer underneath."
      />

      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />

      <SurfacePanel
        radius="xl"
        tone="soft"
        className="mb-6 px-4 py-4 md:px-6 md:py-5"
      >
        {/* ── Header row ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Status
            </h2>
            <span className="text-muted-foreground/40">•</span>
            <span className="text-sm font-medium text-foreground">
              {currentStepTitle}
            </span>
          </div>
          {(currentAppLabel || currentAppId) && (
            <div className="hidden items-center gap-2 sm:flex">
              {currentAppLabel && (
                <PortalBadge accent="slate" size="sm">
                  {currentAppLabel}
                </PortalBadge>
              )}
              {currentAppId && (
                <PortalBadge accent="blue" size="sm">
                  ID {currentAppId}
                </PortalBadge>
              )}
            </div>
          )}
        </div>

        {/* ── Mobile badges ── */}
        {(currentAppLabel || currentAppId) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">
            {currentAppLabel && (
              <PortalBadge accent="slate" size="sm">
                {currentAppLabel}
              </PortalBadge>
            )}
            {currentAppId && (
              <PortalBadge accent="blue" size="sm">
                ID {currentAppId}
              </PortalBadge>
            )}
          </div>
        )}

        {/* ── Step indicator ── */}
        <div className="mt-4 border-t border-fade-detail pt-4">
          <StepIndicator steps={STEPS} current={currentStep} />
        </div>
      </SurfacePanel>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <SurfacePanel radius="xl" tone="soft" padding="roomy">
          {loading && (
            <PanelSkeleton minHeight="16rem" detailLines={3} statBlocks={2} />
          )}
          {!loading && step === 'apply' && (
            <ApplicationForm
              onSubmit={handleApply}
              initialValues={applicationFormPrefill}
              governanceThresholdDisplay={governanceThresholdDisplay}
            />
          )}
          {!loading && step === 'apply' && pageError && (
            <p className="portal-red-panel portal-red-text mt-4 rounded-[1rem] border px-4 py-3 text-center text-sm">
              {pageError}
            </p>
          )}
          {step === 'submitting' && (
            <div className="space-y-4">
              <PanelSkeleton minHeight="8rem" detailLines={2} statBlocks={0} />
              <FormSkeleton fields={3} />
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
              proposalBond={governanceProposalBond}
              proposalBondDisplay={governanceProposalBondDisplay}
              acting={proposalSubmitting}
              refreshPending={refreshingGovernanceEligibility}
              actionKind={governanceActionKind ?? undefined}
              actionError={pageError}
              onRefresh={async () => {
                setPageError('');
                setRefreshingGovernanceEligibility(true);
                await refreshGovernanceEligibility().finally(() => {
                  setRefreshingGovernanceEligibility(false);
                });
              }}
              onPrepare={handlePrepareGovernance}
              onSubmitProposal={
                governanceEligibility?.canPropose
                  ? handleSubmitProposal
                  : undefined
              }
              onCancel={handleCancelApplication}
              onWithdrawExcess={
                governanceEligibility?.canPropose &&
                governanceEligibility?.availableToWithdraw !== '0'
                  ? handleWithdrawGovernanceExcess
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
              revealingKey={claimingKey}
              actionError={pageError}
              onRevealKey={async () => {
                await handleClaimApiKey();
              }}
              onKeyRotated={(newKey) =>
                setRegistration((prev) =>
                  prev ? { ...prev, apiKey: newKey } : prev
                )
              }
            />
          )}
        </SurfacePanel>
      </motion.div>
    </PageShell>
  );
}
