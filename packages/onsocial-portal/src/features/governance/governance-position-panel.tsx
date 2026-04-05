'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SectionHeader } from '@/components/layout/section-header';
import { StatStrip, StatStripCell } from '@/components/ui/stat-strip';
import { Button } from '@/components/ui/button';
import {
  PanelSkeleton,
  StatGridSkeleton,
  Skeleton,
} from '@/components/ui/skeleton';
import { SurfacePanel } from '@/components/ui/surface-panel';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useWallet } from '@/contexts/wallet-context';
import {
  buildGovernanceDelegationPlan,
  prepareGovernanceDelegation,
  selfDelegateGovernanceTokens,
  undelegateGovernanceEntries,
  withdrawGovernanceTokens,
} from '@/features/partners/api';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import {
  getGovernanceEligibility,
  socialToYocto,
  TOKEN_CONTRACT,
  viewContractAt,
  yoctoToNear,
  yoctoToSocial,
  type GovernanceEligibilitySnapshot,
} from '@/lib/near-rpc';

type GovernanceActionMode = 'delegate' | 'undelegate' | 'withdraw';

type ActionMetaItem = {
  label: string;
  value: string;
  tone?: 'default' | 'muted';
};

type TokenMetadataView = {
  icon?: string | null;
  symbol?: string | null;
};

function formatSocial(value: string) {
  const numeric = Number(yoctoToSocial(value));

  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

function formatNear(value: string) {
  const numeric = Number(yoctoToNear(value));

  if (!Number.isFinite(numeric)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
  }).format(numeric);
}

function formatSocialShortfallMessage(value: bigint) {
  return `Add ${formatSocial(value.toString())} SOCIAL to continue with delegation.`;
}

function sanitizeAmountInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, '');
  const [wholePart = '', ...fractionParts] = normalized.split('.');
  const fractionPart = fractionParts.join('').slice(0, 18);
  const whole = wholePart.replace(/^0+(?=\d)/, '');

  if (fractionParts.length === 0) {
    return whole;
  }

  return `${whole || '0'}.${fractionPart}`;
}

function formatCooldownRelative(value: string) {
  const ns = BigInt(value || '0');

  if (ns <= 0n) {
    return 'Ready now';
  }

  const remainingMs = Number(ns / 1_000_000n - BigInt(Date.now()));

  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 'Ready now';
  }

  const totalMinutes = Math.ceil(remainingMs / 60_000);
  const totalHours = Math.ceil(remainingMs / 3_600_000);
  const totalDays = Math.ceil(remainingMs / 86_400_000);

  if (totalMinutes < 60) {
    return `Unlocks in ${totalMinutes}m`;
  }

  if (totalHours < 24) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes > 0
      ? `Unlocks in ${hours}h ${minutes}m`
      : `Unlocks in ${hours}h`;
  }

  if (totalDays < 7) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return hours > 0 ? `Unlocks in ${days}d ${hours}h` : `Unlocks in ${days}d`;
  }

  return `Unlocks in ${totalDays} days`;
}

function formatCooldownDuration(value: string | null | undefined) {
  const ns = BigInt(value || '0');

  if (ns <= 0n) {
    return null;
  }

  const totalSeconds = Number(ns / 1_000_000_000n);

  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return null;
  }

  const totalMinutes = Math.ceil(totalSeconds / 60);
  const totalHours = Math.ceil(totalMinutes / 60);
  const totalDays = Math.ceil(totalHours / 24);

  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  }

  if (totalHours < 24) {
    return `${totalHours} hour${totalHours === 1 ? '' : 's'}`;
  }

  return `${totalDays} day${totalDays === 1 ? '' : 's'}`;
}

function parseAmountToYocto(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return 0n;
  }

  try {
    return BigInt(socialToYocto(normalized));
  } catch {
    return 0n;
  }
}

function buildUndelegateChunks(entries: string[], amount: bigint) {
  const chunks: string[] = [];
  let remaining = amount;

  for (const entry of entries) {
    if (remaining <= 0n) {
      break;
    }

    const entryAmount = BigInt(entry || '0');

    if (entryAmount <= 0n) {
      continue;
    }

    const nextChunk = entryAmount < remaining ? entryAmount : remaining;
    chunks.push(nextChunk.toString());
    remaining -= nextChunk;
  }

  return remaining === 0n ? chunks : [];
}

export function GovernancePositionPanel() {
  const { accountId, wallet, connect } = useWallet();
  const [eligibility, setEligibility] =
    useState<GovernanceEligibilitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [actingMode, setActingMode] = useState<GovernanceActionMode | null>(
    null
  );
  const [actionMode, setActionMode] =
    useState<GovernanceActionMode>('delegate');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState('');
  const [tokenIconSrc, setTokenIconSrc] = useState<string | null>(null);
  const { txResult, clearTxResult, setTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);

  const loadEligibility = useCallback(async () => {
    if (!accountId) {
      setEligibility(null);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');

    try {
      const nextEligibility = await getGovernanceEligibility(accountId);
      setEligibility(nextEligibility);
      return nextEligibility;
    } catch {
      setEligibility(null);
      setError("Could not load this wallet's governance position.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    setEligibility(null);
    setError('');
    setAmountInput('');
    setActingMode(null);
  }, [accountId]);

  useEffect(() => {
    void loadEligibility();
  }, [loadEligibility]);

  useEffect(() => {
    viewContractAt<TokenMetadataView>(TOKEN_CONTRACT, 'ft_metadata', {})
      .then((metadata) => {
        if (metadata?.icon) {
          setTokenIconSrc(metadata.icon);
        }
      })
      .catch(() => {
        setTokenIconSrc(null);
      });
  }, []);

  const amountYocto = parseAmountToYocto(amountInput);
  const hasValidAmount = amountYocto > 0n;
  const isInitialLoading = loading && !eligibility;
  const walletBalanceYocto = BigInt(eligibility?.walletBalance ?? '0');
  const availableYocto = BigInt(eligibility?.availableToDelegate ?? '0');
  const selfDelegatedYocto = BigInt(eligibility?.selfDelegatedWeight ?? '0');
  const withdrawableYocto = BigInt(eligibility?.availableToWithdraw ?? '0');
  const undelegatedYocto = BigInt(eligibility?.availableToDelegate ?? '0');
  const cooldownLockedYocto = BigInt(eligibility?.cooldownLockedAmount ?? '0');
  const remainingToThresholdYocto = BigInt(
    eligibility?.remainingToThreshold ?? '0'
  );
  const maxDelegateYocto = walletBalanceYocto + availableYocto;

  const maxForMode =
    actionMode === 'delegate'
      ? maxDelegateYocto
      : actionMode === 'undelegate'
        ? selfDelegatedYocto
        : withdrawableYocto;

  const actionConfig = useMemo(() => {
    if (!eligibility) {
      return {
        title: 'Manage balance',
        info: 'Connect a wallet to manage governance balances from one place.',
        cta: 'Submit',
      };
    }

    if (actionMode === 'delegate') {
      if (eligibility.isInCooldown) {
        return {
          title: 'Cooldown active',
          info: `Undelegation triggered a cooldown. ${formatCooldownRelative(eligibility.nextActionTimestamp)}.`,
          cta: 'Delegate',
        };
      }

      const requiredDeposit =
        hasValidAmount && amountYocto > availableYocto
          ? amountYocto - availableYocto
          : 0n;

      const storageNeeded = BigInt(eligibility.delegateActionNearStorageNeeded);
      const delegateStorageLimitReached =
        eligibility.isRegistered && storageNeeded > 0n;
      let info = 'Delegates from your staked balance.';

      if (delegateStorageLimitReached) {
        info = 'Undelegate an existing entry before delegating again.';
      } else if (storageNeeded > 0n && requiredDeposit > 0n) {
        info = `Adds ${formatNear(eligibility.delegateActionNearStorageNeeded)} NEAR for storage and deposits ${formatSocial(requiredDeposit.toString())} SOCIAL before delegating.`;
      } else if (storageNeeded > 0n) {
        info = `Adds ${formatNear(eligibility.delegateActionNearStorageNeeded)} NEAR for storage before delegating.`;
      } else if (requiredDeposit > 0n) {
        info = `Deposits ${formatSocial(requiredDeposit.toString())} SOCIAL before delegating.`;
      }

      return {
        title: 'Delegate SOCIAL',
        info,
        cta: 'Delegate',
      };
    }

    if (actionMode === 'undelegate') {
      return {
        title: 'Undelegate SOCIAL',
        info: 'Cooldown starts immediately after undelegation.',
        cta: 'Undelegate',
      };
    }

    return {
      title: 'Withdraw',
      info: eligibility.isInCooldown
        ? 'Available after cooldown.'
        : BigInt(eligibility.availableToWithdraw) > 0n
          ? `${formatSocial(eligibility.availableToWithdraw)} SOCIAL is ready to withdraw.`
          : 'No SOCIAL is ready to withdraw yet.',
      cta: 'Withdraw',
    };
  }, [actionMode, amountYocto, availableYocto, eligibility, hasValidAmount]);

  const setMaxAmount = useCallback(() => {
    setAmountInput(maxForMode > 0n ? yoctoToSocial(maxForMode.toString()) : '');
  }, [maxForMode]);

  const setNeededAmount = useCallback(() => {
    setAmountInput(
      remainingToThresholdYocto > 0n
        ? yoctoToSocial(remainingToThresholdYocto.toString())
        : ''
    );
  }, [remainingToThresholdYocto]);

  const showNeededShortcut =
    actionMode === 'delegate' &&
    !eligibility?.isInCooldown &&
    remainingToThresholdYocto > 0n;

  const actionBlockedReason = useMemo(() => {
    if (!eligibility || !hasValidAmount) {
      return '';
    }

    if (actionMode === 'delegate') {
      if (eligibility.isInCooldown) {
        return formatCooldownRelative(eligibility.nextActionTimestamp);
      }

      if (amountYocto > maxForMode) {
        return formatSocialShortfallMessage(amountYocto - maxForMode);
      }

      const plan = buildGovernanceDelegationPlan(eligibility, amountYocto);

      if (plan.delegateStorageLimitReached) {
        return 'Undelegate an existing entry before delegating again.';
      }

      if (BigInt(eligibility.nearBalance) < BigInt(plan.requiredNearStorage)) {
        const shortfall =
          BigInt(plan.requiredNearStorage) - BigInt(eligibility.nearBalance);
        return `Add ${formatNear(shortfall.toString())} NEAR for storage.`;
      }

      return '';
    }

    if (actionMode === 'undelegate') {
      if (amountYocto > selfDelegatedYocto) {
        return 'Lower the amount to your delegated SOCIAL.';
      }

      const chunks = buildUndelegateChunks(
        eligibility.selfDelegationEntries,
        amountYocto
      );

      if (chunks.length === 0) {
        return 'This amount cannot be matched to current delegation entries.';
      }

      return '';
    }

    if (eligibility.isInCooldown) {
      return formatCooldownRelative(eligibility.nextActionTimestamp);
    }

    if (amountYocto > withdrawableYocto) {
      return 'Lower the amount to ready SOCIAL.';
    }

    return '';
  }, [
    actionMode,
    amountYocto,
    eligibility,
    hasValidAmount,
    maxForMode,
    selfDelegatedYocto,
    withdrawableYocto,
  ]);

  const actionMetaItems = useMemo<ActionMetaItem[]>(() => {
    if (!eligibility) {
      return [];
    }

    if (actionMode === 'delegate') {
      return [];
    }

    if (actionMode === 'undelegate') {
      const cooldownDuration = formatCooldownDuration(
        eligibility.cooldownDurationNs
      );

      return [
        {
          label: 'Currently delegated',
          value: `${formatSocial(selfDelegatedYocto.toString())} SOCIAL`,
        },
        {
          label: 'Cooldown after action',
          value: cooldownDuration ?? 'Set on-chain',
          tone: 'muted',
        },
      ];
    }

    const items: ActionMetaItem[] = [];

    if (withdrawableYocto > 0n) {
      items.push({
        label: 'Ready to withdraw',
        value: `${formatSocial(withdrawableYocto.toString())} SOCIAL`,
      });
    }

    if (eligibility.isInCooldown) {
      items.push({
        label: 'Next unlock',
        value: formatCooldownRelative(eligibility.nextActionTimestamp),
        tone: 'muted',
      });
    }

    return items;
  }, [actionMode, eligibility, selfDelegatedYocto, withdrawableYocto]);

  const balanceItems = useMemo(() => {
    const items: Array<{
      label: string;
      value: string;
      valueClassName?: string;
    }> = [
      {
        label: 'Wallet',
        value: formatSocial(eligibility?.walletBalance ?? '0'),
      },
      { label: 'Staked', value: formatSocial(eligibility?.voteAmount ?? '0') },
      {
        label: 'Delegated',
        value: formatSocial(eligibility?.delegatedWeight ?? '0'),
      },
    ];

    if (cooldownLockedYocto > 0n) {
      items.push({
        label: 'In Cooldown',
        value: formatSocial(eligibility?.cooldownLockedAmount ?? '0'),
        valueClassName: 'portal-amber-text',
      });
    } else if (withdrawableYocto > 0n) {
      items.push({
        label: 'Withdrawable',
        value: formatSocial(eligibility?.availableToWithdraw ?? '0'),
        valueClassName: 'portal-green-text',
      });
    } else if (undelegatedYocto > 0n) {
      items.push({
        label: 'Undelegated',
        value: formatSocial(eligibility?.availableToDelegate ?? '0'),
        valueClassName: 'portal-blue-text',
      });
    }

    return items;
  }, [
    cooldownLockedYocto,
    eligibility?.availableToDelegate,
    eligibility?.availableToWithdraw,
    eligibility?.cooldownLockedAmount,
    eligibility?.delegatedWeight,
    eligibility?.voteAmount,
    eligibility?.walletBalance,
    undelegatedYocto,
    withdrawableYocto,
  ]);

  const runDelegate = useCallback(async () => {
    if (!wallet || !accountId) {
      setTxResult({
        type: 'error',
        msg: 'Connect a wallet to manage this balance.',
      });
      return;
    }

    if (!eligibility?.stakingContractId) {
      setTxResult({
        type: 'error',
        msg: 'Governance staking is not configured yet.',
      });
      return;
    }

    if (!hasValidAmount) {
      setError('Enter a SOCIAL amount greater than zero.');
      return;
    }

    if (eligibility.isInCooldown) {
      setError(formatCooldownRelative(eligibility.nextActionTimestamp));
      return;
    }

    if (amountYocto > maxDelegateYocto) {
      setError(
        'This wallet does not have enough ready SOCIAL for that delegation.'
      );
      return;
    }

    const plan = buildGovernanceDelegationPlan(eligibility, amountYocto);

    if (plan.delegateStorageLimitReached) {
      setError('Undelegate an existing entry before delegating again.');
      return;
    }

    if (BigInt(eligibility.nearBalance) < BigInt(plan.requiredNearStorage)) {
      setError(
        'This wallet does not have enough NEAR to cover governance storage.'
      );
      return;
    }

    setError('');
    clearTxResult();
    setActingMode('delegate');

    try {
      let current = (await loadEligibility()) ?? eligibility;

      if (!current?.stakingContractId) {
        throw new Error('No governance staking contract is configured yet.');
      }

      if (current.isInCooldown) {
        throw new Error(formatCooldownRelative(current.nextActionTimestamp));
      }

      const plan = buildGovernanceDelegationPlan(current, amountYocto);

      if (plan.delegateStorageLimitReached) {
        throw new Error(
          'Undelegate an existing entry before delegating again.'
        );
      }

      if (BigInt(plan.depositAmount) > 0n) {
        if (BigInt(plan.depositAmount) > BigInt(current.walletBalance)) {
          throw new Error(
            'This wallet does not have enough SOCIAL to cover that delegation.'
          );
        }
      }

      if (BigInt(current.nearBalance) < BigInt(plan.requiredNearStorage)) {
        throw new Error(
          'This wallet does not have enough NEAR to cover governance storage.'
        );
      }

      if (plan.needsBatch) {
        const delegationTxHashes = await prepareGovernanceDelegation(
          wallet,
          current.stakingContractId,
          accountId,
          {
            storageDeposit: plan.storageDeposit,
            depositAmount: plan.depositAmount,
            delegateAmount: plan.delegateAmount,
          }
        );

        if (delegationTxHashes.length === 0) {
          throw new Error(
            'Governance delegation returned no transaction hash.'
          );
        }

        const delegationConfirmed = await trackTransaction({
          txHashes: delegationTxHashes,
          submittedMessage:
            delegationTxHashes.length > 1
              ? 'Governance delegation flow submitted. Confirm the wallet approval and on-chain settlement.'
              : 'Governance delegation submitted. Confirming on-chain.',
          successMessage:
            delegationTxHashes.length > 1
              ? 'Governance deposit and delegation confirmed on-chain.'
              : 'Governance delegation confirmed on-chain.',
          failureMessage:
            delegationTxHashes.length > 1
              ? 'Governance deposit or delegation failed on-chain.'
              : 'Governance delegation failed on-chain.',
        });

        if (!delegationConfirmed) {
          return;
        }

        setAmountInput('');
        await loadEligibility();
        return;
      }

      const delegateTxHash = await selfDelegateGovernanceTokens(
        wallet,
        current.stakingContractId,
        accountId,
        amountYocto.toString()
      );

      if (!delegateTxHash) {
        throw new Error('Governance delegation returned no transaction hash.');
      }

      const delegationConfirmed = await trackTransaction({
        txHashes: [delegateTxHash],
        submittedMessage:
          'Governance delegation submitted. Confirming on-chain.',
        successMessage: 'Governance delegation confirmed on-chain.',
        failureMessage: 'Governance delegation failed on-chain.',
      });

      if (!delegationConfirmed) {
        return;
      }

      setAmountInput('');
      await loadEligibility();
    } catch (nextError) {
      setTxResult({
        type: 'error',
        msg:
          nextError instanceof Error
            ? nextError.message
            : 'Governance delegation failed.',
      });
    } finally {
      setActingMode(null);
    }
  }, [
    accountId,
    amountYocto,
    clearTxResult,
    eligibility,
    hasValidAmount,
    loadEligibility,
    maxDelegateYocto,
    setTxResult,
    trackTransaction,
    wallet,
  ]);

  const runUndelegate = useCallback(async () => {
    if (!wallet || !accountId) {
      setTxResult({
        type: 'error',
        msg: 'Connect a wallet to manage this balance.',
      });
      return;
    }

    if (!eligibility?.stakingContractId) {
      setTxResult({
        type: 'error',
        msg: 'Governance staking is not configured yet.',
      });
      return;
    }

    if (!hasValidAmount) {
      setError('Enter a SOCIAL amount greater than zero.');
      return;
    }

    if (amountYocto > selfDelegatedYocto) {
      setError('This wallet is not self-delegating that much SOCIAL.');
      return;
    }

    const chunks = buildUndelegateChunks(
      eligibility.selfDelegationEntries,
      amountYocto
    );

    if (chunks.length === 0) {
      setError(
        'This undelegation amount could not be mapped to the current delegation entries.'
      );
      return;
    }

    setError('');
    clearTxResult();
    setActingMode('undelegate');

    try {
      const undelegateTxHash = await undelegateGovernanceEntries(
        wallet,
        eligibility.stakingContractId,
        accountId,
        chunks
      );

      if (!undelegateTxHash) {
        throw new Error(
          'Governance undelegation returned no transaction hash.'
        );
      }

      const undelegateConfirmed = await trackTransaction({
        txHashes: [undelegateTxHash],
        submittedMessage:
          'Governance undelegation submitted. Confirming on-chain.',
        successMessage: 'Governance undelegation confirmed on-chain.',
        failureMessage: 'Governance undelegation failed on-chain.',
      });

      if (!undelegateConfirmed) {
        return;
      }

      setAmountInput('');
      setActionMode('withdraw');
      await loadEligibility();
    } catch (nextError) {
      setTxResult({
        type: 'error',
        msg:
          nextError instanceof Error
            ? nextError.message
            : 'Governance undelegation failed.',
      });
    } finally {
      setActingMode(null);
    }
  }, [
    accountId,
    amountYocto,
    clearTxResult,
    eligibility,
    hasValidAmount,
    loadEligibility,
    selfDelegatedYocto,
    setTxResult,
    trackTransaction,
    wallet,
  ]);

  const runWithdraw = useCallback(async () => {
    if (!wallet || !accountId) {
      setTxResult({
        type: 'error',
        msg: 'Connect a wallet to manage this balance.',
      });
      return;
    }

    if (!eligibility?.stakingContractId) {
      setTxResult({
        type: 'error',
        msg: 'Governance staking is not configured yet.',
      });
      return;
    }

    if (!hasValidAmount) {
      setError('Enter a SOCIAL amount greater than zero.');
      return;
    }

    if (eligibility.isInCooldown) {
      setError(formatCooldownRelative(eligibility.nextActionTimestamp));
      return;
    }

    if (amountYocto > withdrawableYocto) {
      setError('That amount is not withdrawable yet.');
      return;
    }

    setError('');
    clearTxResult();
    setActingMode('withdraw');

    try {
      const withdrawTxHash = await withdrawGovernanceTokens(
        wallet,
        eligibility.stakingContractId,
        amountYocto.toString()
      );

      if (!withdrawTxHash) {
        throw new Error('Governance withdrawal returned no transaction hash.');
      }

      const withdrawConfirmed = await trackTransaction({
        txHashes: [withdrawTxHash],
        submittedMessage:
          'Governance withdrawal submitted. Confirming on-chain.',
        successMessage: 'Available governance SOCIAL withdrawn to your wallet.',
        failureMessage: 'Governance withdrawal failed on-chain.',
      });

      if (!withdrawConfirmed) {
        return;
      }

      setAmountInput('');
      await loadEligibility();
    } catch (nextError) {
      setTxResult({
        type: 'error',
        msg:
          nextError instanceof Error
            ? nextError.message
            : 'Governance withdrawal failed.',
      });
    } finally {
      setActingMode(null);
    }
  }, [
    accountId,
    amountYocto,
    clearTxResult,
    eligibility,
    hasValidAmount,
    loadEligibility,
    setTxResult,
    trackTransaction,
    wallet,
    withdrawableYocto,
  ]);

  const handleSubmit = useCallback(async () => {
    if (actionMode === 'delegate') {
      await runDelegate();
      return;
    }

    if (actionMode === 'undelegate') {
      await runUndelegate();
      return;
    }

    await runWithdraw();
  }, [actionMode, runDelegate, runUndelegate, runWithdraw]);

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <SurfacePanel tone="soft" className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-2xl min-w-0">
            <SectionHeader
              badge="Balances"
              className="mb-0"
              contentClassName="max-w-2xl"
            />
          </div>
          {accountId ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                void loadEligibility();
              }}
              disabled={loading}
              title={loading ? 'Refreshing balances' : 'Refresh balances'}
              aria-label="Refresh balances"
              className="h-8 w-8 shrink-0 rounded-full border-border/40 bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          ) : null}
        </div>

        {!accountId ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-fade-detail pt-5">
            <Button onClick={() => connect()} size="sm">
              Connect wallet
            </Button>
          </div>
        ) : isInitialLoading ? (
          <div className="mt-5 space-y-4 border-t border-fade-detail pt-5">
            <StatGridSkeleton items={3} />
            <div className="rounded-[1.25rem] border border-border/35 bg-background/20 p-4">
              <div className="flex items-center justify-between gap-4">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="h-4 w-24 rounded-full bg-white/6" />
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-border/40 bg-background/35 p-4 md:p-5">
              <PanelSkeleton minHeight="13rem" detailLines={2} statBlocks={2} />
            </div>
          </div>
        ) : eligibility ? (
          <>
            <div className="mt-5 pt-5">
              <StatStrip>
                {balanceItems.map((item, index) => (
                  <StatStripCell
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    valueClassName={item.valueClassName}
                    showDivider={
                      (index + 1) % 3 !== 0 && index < balanceItems.length - 1
                    }
                    size="md"
                  />
                ))}
              </StatStrip>

              <StatStrip columns={2} className="mt-4">
                <StatStripCell
                  label="Threshold"
                  value={`${formatSocial(eligibility.requiredWeight)} SOCIAL`}
                  showDivider
                  size="md"
                />
                <StatStripCell
                  label="Status"
                  value={
                    eligibility.canPropose
                      ? 'Eligible'
                      : `${formatSocial(eligibility.remainingToThreshold)} to go`
                  }
                  valueClassName={
                    eligibility.canPropose
                      ? 'portal-green-text'
                      : 'portal-blue-text'
                  }
                  size="md"
                />
              </StatStrip>
              {eligibility.isInCooldown ? (
                <StatStrip columns={1} className="mt-2">
                  <StatStripCell
                    label="Cooldown"
                    value={formatCooldownRelative(
                      eligibility.nextActionTimestamp
                    )}
                    valueClassName="portal-amber-text"
                    size="md"
                  />
                </StatStrip>
              ) : null}
            </div>

            <div className="mt-5 border-t border-fade-detail pt-5">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    'delegate',
                    'undelegate',
                    'withdraw',
                  ] as GovernanceActionMode[]
                ).map((mode) => {
                  const active = actionMode === mode;

                  return (
                    <Button
                      key={mode}
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      size="xs"
                      onClick={() => {
                        setActionMode(mode);
                        setAmountInput('');
                        setError('');
                      }}
                    >
                      {mode === 'delegate'
                        ? 'Delegate'
                        : mode === 'undelegate'
                          ? 'Undelegate'
                          : 'Withdraw'}
                    </Button>
                  );
                })}
              </div>

              <motion.div
                layout
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="mt-4 rounded-[1.5rem] border border-border/40 bg-background/35 p-4 md:p-5"
              >
                <motion.p
                  layout="position"
                  className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                >
                  {actionConfig.title}
                </motion.p>

                <motion.div layout className="mt-4 flex flex-col gap-3">
                  <motion.div layout className="flex-1">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label
                        htmlFor="governance-amount-input"
                        className="block text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                      >
                        Amount
                      </label>
                      <div className="flex items-center justify-end gap-2">
                        {showNeededShortcut ? (
                          <Button
                            type="button"
                            onClick={setNeededAmount}
                            variant="outline"
                            size="xs"
                          >
                            Needed
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          onClick={setMaxAmount}
                          variant="outline"
                          size="xs"
                        >
                          Max
                        </Button>
                      </div>
                    </div>
                    <SurfacePanel
                      radius="md"
                      tone="inset"
                      borderTone="subtle"
                      padding="none"
                      className="portal-blue-focus flex items-center gap-3 px-4 py-3"
                    >
                      <input
                        id="governance-amount-input"
                        inputMode="decimal"
                        placeholder="0"
                        value={amountInput}
                        onChange={(event) => {
                          setAmountInput(
                            sanitizeAmountInput(event.target.value)
                          );
                          setError('');
                        }}
                        className="min-w-0 flex-1 bg-transparent text-2xl font-semibold tracking-[-0.02em] outline-none placeholder:text-muted-foreground/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none md:text-3xl"
                      />
                      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                        {tokenIconSrc ? (
                          <img
                            src={tokenIconSrc}
                            alt="SOCIAL"
                            className="h-5 w-5 rounded-full object-cover"
                            onError={() => setTokenIconSrc(null)}
                          />
                        ) : (
                          <>
                            <img
                              src="/onsocial_icon.svg"
                              alt="SOCIAL"
                              className="h-5 w-5 rounded-full object-cover dark:hidden"
                            />
                            <img
                              src="/onsocial_icon_dark.svg"
                              alt="SOCIAL"
                              className="hidden h-5 w-5 rounded-full object-cover dark:block"
                            />
                          </>
                        )}
                        SOCIAL
                      </span>
                    </SurfacePanel>
                  </motion.div>

                  <motion.div
                    layout
                    className="min-h-[4.75rem] rounded-[1rem] border border-border/40 bg-background/45 px-3 py-3 text-sm text-muted-foreground"
                  >
                    <AnimatePresence initial={false} mode="wait">
                      {error ? (
                        <motion.p
                          key="governance-action-error"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                          className="portal-red-text"
                        >
                          {error}
                        </motion.p>
                      ) : actionBlockedReason ? (
                        <motion.p
                          key={`governance-action-blocked-${actionMode}`}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                        >
                          {actionBlockedReason}
                        </motion.p>
                      ) : (
                        <motion.p
                          key={`governance-action-info-${actionMode}`}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: 'easeOut' }}
                        >
                          {actionConfig.info}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  <Button
                    type="button"
                    onClick={() => {
                      void handleSubmit();
                    }}
                    disabled={
                      !hasValidAmount ||
                      maxForMode === 0n ||
                      !!actionBlockedReason ||
                      actingMode !== null ||
                      (actionMode === 'delegate' &&
                        !eligibility?.isInCooldown &&
                        !!eligibility?.isRegistered &&
                        BigInt(eligibility.delegateActionNearStorageNeeded) >
                          0n)
                    }
                    loading={actingMode === actionMode}
                    className="h-11 w-full"
                  >
                    {actionConfig.cta}
                  </Button>
                </motion.div>

                <AnimatePresence initial={false}>
                  {actionMetaItems.length > 0 ? (
                    <motion.div
                      layout
                      key={`governance-action-meta-${actionMode}`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                      className="mt-4 overflow-hidden"
                    >
                      <StatStrip columns={Math.min(actionMetaItems.length, 3)}>
                        {actionMetaItems.map((item, index) => (
                          <StatStripCell
                            key={item.label}
                            label={item.label}
                            value={item.value}
                            valueClassName={
                              item.tone === 'muted'
                                ? 'text-muted-foreground font-mono'
                                : 'text-foreground font-mono'
                            }
                            showDivider={index < actionMetaItems.length - 1}
                            size="md"
                          />
                        ))}
                      </StatStrip>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </div>
          </>
        ) : null}
      </SurfacePanel>
    </>
  );
}
