'use client';

/**
 * DAO Manage → Boost — lock / collect / increase / renew / extend / unlock
 * via add_proposal. Position belongs to the DAO after approval.
 */

import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import type { BoostLockPeriod } from '@onsocial/sdk/advanced';
import {
  OsField,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { OsSlideOverScreen } from '@/components/app/os-slide-over-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { usePortfolioMoodPreviewOptional } from '@/contexts/portfolio-mood-preview-context';
import {
  BOOST_CLAIM_DUST_YOCTO,
  BOOST_DEFAULT_LOCK_MONTHS,
  BOOST_LOCK_PERIOD_OPTIONS,
  BOOST_MIN_LOCK_SOCIAL_LABEL,
  BOOST_MIN_LOCK_YOCTO,
  fetchWalletSocialBalanceYocto,
  formatTimeRemainingLabel,
  formatUnlockDateLabel,
  isLongerLockPeriod,
  longerLockPeriodOptions,
  lockPeriodOption,
  resolveCurrentLockMonths,
} from '@/features/boost/boost-position';
import { useBoostPosition } from '@/features/boost/use-boost-position';
import {
  buildDaoBoostCollectProposalPayload,
  buildDaoBoostExtendProposalPayload,
  buildDaoBoostLockProposalPayload,
  buildDaoBoostRenewProposalPayload,
  buildDaoBoostUnlockProposalPayload,
} from '@/features/protocol/dao-boost-lock';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import type { ProtocolGovernanceEligibility } from '@/features/protocol/protocol-eligibility';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import { formatSocialCompact, yoctoToSocial } from '@/lib/format-social-balance';
import {
  SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS,
  socialToYocto,
} from '@/lib/social-spend-profile';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const DAO_BOOST_Z = 90;
const DAO_BOOST_CONFIRM_Z = 110;

type DaoBoostMode =
  | 'lock'
  | 'collect'
  | 'increase'
  | 'renew'
  | 'extend'
  | 'unlock';

type PendingConfirm = {
  title: string;
  body: string;
  actionLabel: string;
  payload: ProtocolProposalPayload;
};

export function DaoBoostSheet({
  open,
  daoAccountId,
  daoName,
  eligibility,
  eligibilityLoading = false,
  onClose,
  onRequestStake,
}: {
  open: boolean;
  daoAccountId: string;
  daoName: string;
  eligibility: ProtocolGovernanceEligibility | null;
  eligibilityLoading?: boolean;
  onClose: () => void;
  onRequestStake?: () => void;
}) {
  const formId = useId();
  const { getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const moodPreview = usePortfolioMoodPreviewOptional();
  const {
    loaded,
    hasPosition,
    lockedYocto,
    claimableYocto,
    canUnlock,
    account,
    lockStatus,
    refresh,
    resetLiveCounterAfterClaim,
  } = useBoostPosition(daoAccountId, { live: open });

  const [mode, setMode] = useState<DaoBoostMode>('lock');
  const [amountInput, setAmountInput] = useState('');
  const [months, setMonths] = useState<BoostLockPeriod>(
    BOOST_DEFAULT_LOCK_MONTHS
  );
  const [extendMonths, setExtendMonths] = useState<BoostLockPeriod | null>(
    null
  );
  const [treasuryYocto, setTreasuryYocto] = useState<bigint | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const currentLockMonths = resolveCurrentLockMonths(account, lockStatus);
  const extendOptions = longerLockPeriodOptions(currentLockMonths);

  useEffect(() => {
    if (!open) return;
    setAmountInput('');
    setMonths(BOOST_DEFAULT_LOCK_MONTHS);
    setExtendMonths(null);
    setError(null);
    setConfirm(null);
    setPending(false);
    let cancelled = false;
    setTreasuryLoading(true);
    void fetchWalletSocialBalanceYocto(daoAccountId)
      .then((next) => {
        if (!cancelled) setTreasuryYocto(next);
      })
      .catch(() => {
        if (!cancelled) setTreasuryYocto(null);
      })
      .finally(() => {
        if (!cancelled) setTreasuryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, daoAccountId]);

  useEffect(() => {
    if (!open || !loaded) return;
    queueMicrotask(() => {
      if (!hasPosition) {
        setMode('lock');
        return;
      }
      setMode(canUnlock ? 'unlock' : 'collect');
    });
  }, [open, loaded, hasPosition, canUnlock]);

  const normalizedAmount = finalizeAmountInput(
    amountInput,
    SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
  );
  let amountYocto = 0n;
  try {
    amountYocto = normalizedAmount
      ? BigInt(socialToYocto(normalizedAmount))
      : 0n;
  } catch {
    amountYocto = 0n;
  }
  const belowMinimum = amountYocto > 0n && amountYocto < BOOST_MIN_LOCK_YOCTO;
  const insufficient =
    treasuryYocto != null && amountYocto > 0n && amountYocto > treasuryYocto;
  const amountReady =
    amountYocto >= BOOST_MIN_LOCK_YOCTO && !insufficient && !pending;

  const modeChips = useMemo(() => {
    if (!hasPosition) return [] as { id: DaoBoostMode; label: string }[];
    if (canUnlock) {
      return [
        { id: 'unlock' as const, label: 'Unlock' },
        { id: 'renew' as const, label: 'Renew' },
        ...(extendOptions.length > 0
          ? [{ id: 'extend' as const, label: 'Extend' }]
          : []),
      ];
    }
    return [
      { id: 'collect' as const, label: 'Collect' },
      { id: 'increase' as const, label: 'Increase' },
      { id: 'renew' as const, label: 'Renew' },
      ...(extendOptions.length > 0
        ? [{ id: 'extend' as const, label: 'Extend' }]
        : []),
    ];
  }, [canUnlock, extendOptions.length, hasPosition]);

  const footer = ((): {
    label: string;
    ready: boolean;
    onClick: () => void;
  } | null => {
    if (!loaded) return null;
    if (mode === 'lock' || mode === 'increase') {
      return {
        label: mode === 'increase' ? 'Propose increase' : 'Propose Boost',
        ready: amountReady,
        onClick: () => {
          if (!amountReady) {
            if (belowMinimum) {
              setError(`Minimum is ${BOOST_MIN_LOCK_SOCIAL_LABEL} SOCIAL.`);
            } else if (insufficient) {
              setError('DAO treasury does not hold enough SOCIAL.');
            }
            return;
          }
          const lockMonths: BoostLockPeriod =
            mode === 'increase'
              ? ((lockPeriodOption(currentLockMonths)?.months ??
                  BOOST_DEFAULT_LOCK_MONTHS) as BoostLockPeriod)
              : months;
          const amountLabel = formatSocialCompact(amountYocto.toString());
          const period =
            lockPeriodOption(lockMonths)?.label ?? `${lockMonths} months`;
          setConfirm({
            title:
              mode === 'increase' ? 'Propose increase?' : 'Propose Boost?',
            body:
              mode === 'increase'
                ? `Add ${amountLabel} SOCIAL to the DAO Boost lock (${period}).`
                : `Lock ${amountLabel} SOCIAL for ${period} from the DAO treasury into Boost.`,
            actionLabel: 'DAO Boost',
            payload: buildDaoBoostLockProposalPayload({
              amountYocto: amountYocto.toString(),
              months: lockMonths,
              daoLabel: daoName,
            }),
          });
        },
      };
    }
    if (mode === 'collect') {
      const claimLabel = formatSocialCompact(claimableYocto.toString());
      return {
        label: 'Propose collect',
        ready: claimableYocto >= BOOST_CLAIM_DUST_YOCTO && !pending,
        onClick: () => {
          if (claimableYocto < BOOST_CLAIM_DUST_YOCTO) {
            setError('Nothing to collect yet.');
            return;
          }
          setConfirm({
            title: 'Propose collect?',
            body: `Collect ${claimLabel} SOCIAL Boost rewards into the DAO wallet.`,
            actionLabel: 'DAO Boost collect',
            payload: buildDaoBoostCollectProposalPayload({
              daoLabel: daoName,
              amountLabel: claimLabel,
            }),
          });
        },
      };
    }
    if (mode === 'unlock') {
      return {
        label: 'Propose unlock',
        ready: canUnlock && !pending,
        onClick: () => {
          setConfirm({
            title: 'Propose unlock?',
            body: `Unlock the DAO Boost position and return principal to the DAO wallet.`,
            actionLabel: 'DAO Boost unlock',
            payload: buildDaoBoostUnlockProposalPayload({ daoLabel: daoName }),
          });
        },
      };
    }
    if (mode === 'renew') {
      return {
        label: 'Propose renew',
        ready: !pending,
        onClick: () => {
          setConfirm({
            title: 'Propose renew?',
            body: `Renew the DAO Boost lock for another period of the same length.`,
            actionLabel: 'DAO Boost renew',
            payload: buildDaoBoostRenewProposalPayload({ daoLabel: daoName }),
          });
        },
      };
    }
    if (mode === 'extend') {
      const canExtend =
        extendMonths != null &&
        isLongerLockPeriod(extendMonths, currentLockMonths);
      return {
        label: canExtend
          ? `Propose extend to ${lockPeriodOption(extendMonths)?.short}`
          : 'Pick a period',
        ready: Boolean(canExtend) && !pending,
        onClick: () => {
          if (!extendMonths || !canExtend) {
            setError('Pick a longer period than the current commitment.');
            return;
          }
          setConfirm({
            title: 'Propose extend?',
            body: `Extend the DAO Boost lock to ${lockPeriodOption(extendMonths)?.label ?? `${extendMonths} months`}.`,
            actionLabel: 'DAO Boost extend',
            payload: buildDaoBoostExtendProposalPayload({
              months: extendMonths,
              daoLabel: daoName,
            }),
          });
        },
      };
    }
    return null;
  })();

  const submitConfirm = async () => {
    if (!confirm || pending) return;
    setPending(true);
    setError(null);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const response = await submitProtocolProposal({
        daoAccountId,
        accountId: signerId,
        wallet,
        payload: confirm.payload,
      });
      const confirmed = await trackTransaction({
        txHashes: response.txHashes,
        submittedMessage: txToastGovPending.actionSubmitted(confirm.actionLabel),
        successMessage:
          txToastGovSuccess.actionConfirmed(`${confirm.actionLabel} proposal`) +
          ' Approve to execute.',
        failureMessage: txToastGovError.actionFailed(
          `${confirm.actionLabel} proposal`
        ),
      });
      if (confirmed) {
        setConfirm(null);
        if (mode === 'collect' || mode === 'unlock') {
          resetLiveCounterAfterClaim();
        }
        await refresh();
        if (mode === 'lock') {
          onClose();
        } else {
          setMode(canUnlock ? 'unlock' : 'collect');
          setAmountInput('');
          setExtendMonths(null);
        }
      }
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      setTxResult({
        type: 'error',
        msg:
          cause instanceof Error
            ? cause.message
            : txToastGovError.actionFailed('DAO Boost proposal'),
      });
    } finally {
      setPending(false);
    }
  };

  const requestConfirm = (event: FormEvent) => {
    event.preventDefault();
    footer?.onClick();
  };

  const showAmountForm = mode === 'lock' || mode === 'increase';
  const showPeriodForNewLock = mode === 'lock';
  const subtitle = !loaded
    ? 'Loading Boost position…'
    : hasPosition
      ? `${formatSocialCompact(lockedYocto)} SOCIAL locked · live after approval`
      : 'Lock treasury SOCIAL into Boost — live after approval.';

  return (
    <>
      <OsSlideOverScreen
        open={open}
        onClose={onClose}
        title="Boost as DAO"
        subtitle={subtitle}
        closeAriaLabel="Back from DAO Boost"
        closeDisabled={pending}
        zIndex={DAO_BOOST_Z}
        className="hub-manage-slide"
        contentClassName="hub-manage-slide-body"
        footer={
          footer ? (
            <div className="hub-manage-sheet-footer">
              <OsSheetActions layout="stack" tone="frosted-primary" borderless>
                <OsSheetAction
                  type="submit"
                  form={formId}
                  ready={footer.ready}
                  pending={pending}
                  pendingLabel="Proposing…"
                  disabled={!footer.ready || pending}
                >
                  {footer.label}
                </OsSheetAction>
              </OsSheetActions>
            </div>
          ) : null
        }
      >
        <form
          id={formId}
          className="hub-manage-form"
          onSubmit={requestConfirm}
        >
          {hasPosition ? (
            <div className="dao-boost-position" aria-live="polite">
              <p className="dao-boost-position-line">
                Locked {formatSocialCompact(lockedYocto)} SOCIAL
              </p>
              <p className="dao-boost-position-line">
                Claimable {formatSocialCompact(claimableYocto)} SOCIAL
              </p>
              {account?.unlock_at ? (
                <p className="dao-boost-position-meta">
                  {formatUnlockDateLabel(account.unlock_at)} ·{' '}
                  {formatTimeRemainingLabel(account.unlock_at)}
                </p>
              ) : null}
            </div>
          ) : null}

          {modeChips.length > 0 ? (
            <div
              className="dao-boost-mode-chips"
              role="tablist"
              aria-label="Boost actions"
            >
              {modeChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === chip.id}
                  className={`dao-boost-mode-chip${
                    mode === chip.id ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => {
                    setMode(chip.id);
                    setError(null);
                    setAmountInput('');
                    setExtendMonths(null);
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}

          {showAmountForm ? (
            <>
              <OsField
                label="Amount"
                htmlFor={`${formId}-amount`}
                hint={
                  treasuryLoading
                    ? 'Loading treasury…'
                    : treasuryYocto != null
                      ? `Treasury ${formatSocialCompact(treasuryYocto.toString())} SOCIAL`
                      : 'Treasury balance unavailable'
                }
              >
                <input
                  id={`${formId}-amount`}
                  inputMode="decimal"
                  value={amountInput}
                  placeholder={BOOST_MIN_LOCK_SOCIAL_LABEL}
                  disabled={pending}
                  onChange={(event) => {
                    setAmountInput(
                      normalizeAmountInput(
                        event.target.value,
                        SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
                      )
                    );
                    setError(null);
                  }}
                  className={osFieldBorderedClassName}
                />
              </OsField>

              {treasuryYocto != null && treasuryYocto > 0n ? (
                <button
                  type="button"
                  className="protocol-tool is-ghost"
                  disabled={pending}
                  onClick={() => {
                    setAmountInput(
                      finalizeAmountInput(
                        yoctoToSocial(treasuryYocto.toString()),
                        SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
                      )
                    );
                    setError(null);
                  }}
                >
                  Use full treasury
                </button>
              ) : null}
            </>
          ) : null}

          {showPeriodForNewLock ? (
            <div
              className="portfolio-boost-periods"
              role="group"
              aria-label="Lock period"
              style={
                {
                  '--boost-period-cols': String(
                    BOOST_LOCK_PERIOD_OPTIONS.length
                  ),
                } as CSSProperties
              }
            >
              {BOOST_LOCK_PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.months}
                  type="button"
                  className={`os-surface-chip${
                    months === option.months ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setMonths(option.months)}
                >
                  {option.short}
                  <span className="portfolio-boost-period-bonus">
                    +{option.bonusPercent}%
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {mode === 'extend' ? (
            <div
              className="portfolio-boost-periods"
              role="group"
              aria-label="Extend to"
              style={
                {
                  '--boost-period-cols': String(
                    Math.max(extendOptions.length, 1)
                  ),
                } as CSSProperties
              }
            >
              {extendOptions.map((option) => (
                <button
                  key={option.months}
                  type="button"
                  className={`os-surface-chip${
                    extendMonths === option.months ? ' is-selected' : ''
                  }`}
                  disabled={pending}
                  onClick={() => setExtendMonths(option.months)}
                >
                  {option.short}
                  <span className="portfolio-boost-period-bonus">
                    +{option.bonusPercent}%
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {mode === 'renew' ? (
            <p className="dao-edit-footnote">
              Renews for another{' '}
              {lockPeriodOption(currentLockMonths)?.label ??
                `${currentLockMonths} months`}{' '}
              without unlocking.
            </p>
          ) : null}

          {mode === 'collect' ? (
            <p className="dao-edit-footnote">
              Rewards return to the DAO SOCIAL wallet after approval.
            </p>
          ) : null}

          {mode === 'unlock' ? (
            <p className="dao-edit-footnote">
              Unlocks principal and collects remaining rewards to the DAO.
            </p>
          ) : null}

          {error ? <p className="guild-form-error">{error}</p> : null}
          {mode === 'lock' ? (
            <p className="dao-edit-footnote">
              Minimum {BOOST_MIN_LOCK_SOCIAL_LABEL} SOCIAL. Position belongs to
              the DAO after council approval.
            </p>
          ) : null}
        </form>
      </OsSlideOverScreen>

      <DaoProposeConfirmSheet
        open={confirm != null}
        title={confirm?.title ?? 'Propose?'}
        body={confirm?.body ?? ''}
        eligibility={eligibility}
        eligibilityLoading={eligibilityLoading}
        pending={pending}
        proposeLabel="Propose"
        zIndex={DAO_BOOST_CONFIRM_Z}
        onDiscard={() => setConfirm(null)}
        onPropose={() => {
          void submitConfirm();
        }}
        onStake={() => {
          setConfirm(null);
          if (onRequestStake) {
            onRequestStake();
            return;
          }
          moodPreview?.requestDaoStake();
        }}
      />
    </>
  );
}
