'use client';

/**
 * DAO Manage → Boost — amount + lock period, then hug confirm → add_proposal.
 * Locks treasury SOCIAL into the DAO’s Boost position (not the proposer).
 */

import {
  useEffect,
  useId,
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
  BOOST_DEFAULT_LOCK_MONTHS,
  BOOST_LOCK_PERIOD_OPTIONS,
  BOOST_MIN_LOCK_SOCIAL_LABEL,
  BOOST_MIN_LOCK_YOCTO,
  fetchWalletSocialBalanceYocto,
} from '@/features/boost/boost-position';
import { buildDaoBoostLockProposalPayload } from '@/features/protocol/dao-boost-lock';
import { DaoProposeConfirmSheet } from '@/features/protocol/dao-propose-confirm-sheet';
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

  const [amountInput, setAmountInput] = useState('');
  const [months, setMonths] = useState<BoostLockPeriod>(
    BOOST_DEFAULT_LOCK_MONTHS
  );
  const [treasuryYocto, setTreasuryYocto] = useState<bigint | null>(null);
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmountInput('');
    setMonths(BOOST_DEFAULT_LOCK_MONTHS);
    setError(null);
    setConfirmOpen(false);
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

  const normalizedAmount = finalizeAmountInput(
    amountInput,
    SOCIAL_SPEND_AMOUNT_INPUT_DECIMALS
  );
  let amountYocto = 0n;
  try {
    amountYocto = normalizedAmount ? socialToYocto(normalizedAmount) : 0n;
  } catch {
    amountYocto = 0n;
  }
  const belowMinimum = amountYocto > 0n && amountYocto < BOOST_MIN_LOCK_YOCTO;
  const insufficient =
    treasuryYocto != null && amountYocto > 0n && amountYocto > treasuryYocto;
  const canPropose =
    amountYocto >= BOOST_MIN_LOCK_YOCTO && !insufficient && !pending;

  const requestConfirm = (event: FormEvent) => {
    event.preventDefault();
    if (!canPropose) {
      if (belowMinimum) {
        setError(`Minimum is ${BOOST_MIN_LOCK_SOCIAL_LABEL} SOCIAL.`);
      } else if (insufficient) {
        setError('DAO treasury does not hold enough SOCIAL.');
      }
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const submit = async () => {
    if (!canPropose) return;
    setPending(true);
    setError(null);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const payload = buildDaoBoostLockProposalPayload({
        amountYocto: amountYocto.toString(),
        months,
        daoLabel: daoName,
      });
      const response = await submitProtocolProposal({
        daoAccountId,
        accountId: signerId,
        wallet,
        payload,
      });
      const confirmed = await trackTransaction({
        txHashes: response.txHashes,
        submittedMessage: txToastGovPending.actionSubmitted('DAO Boost'),
        successMessage:
          txToastGovSuccess.actionConfirmed('DAO Boost proposal') +
          ' Approve to lock treasury SOCIAL.',
        failureMessage: txToastGovError.actionFailed('DAO Boost proposal'),
      });
      if (confirmed) {
        setConfirmOpen(false);
        onClose();
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

  const amountLabel = formatSocialCompact(amountYocto.toString());
  const periodLabel =
    BOOST_LOCK_PERIOD_OPTIONS.find((option) => option.months === months)
      ?.label ?? `${months} months`;

  return (
    <>
      <OsSlideOverScreen
        open={open}
        onClose={onClose}
        title="Boost as DAO"
        subtitle="Lock treasury SOCIAL into Boost — live after approval."
        closeAriaLabel="Back from DAO Boost"
        closeDisabled={pending}
        zIndex={DAO_BOOST_Z}
        className="hub-manage-slide"
        contentClassName="hub-manage-slide-body"
        footer={
          <div className="hub-manage-sheet-footer">
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="submit"
                form={formId}
                ready={canPropose}
                pending={pending}
                pendingLabel="Proposing…"
                disabled={!canPropose}
              >
                Propose Boost
              </OsSheetAction>
            </OsSheetActions>
          </div>
        }
      >
        <form
          id={formId}
          className="hub-manage-form"
          onSubmit={requestConfirm}
        >
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

          <fieldset className="dao-boost-period" disabled={pending}>
            <legend className="dao-boost-period-legend">Lock period</legend>
            <div
              className="boost-period-grid"
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
                  className={`boost-period-chip${
                    months === option.months ? ' is-selected' : ''
                  }`}
                  onClick={() => setMonths(option.months)}
                >
                  <span className="boost-period-chip-short">{option.short}</span>
                  <span className="boost-period-chip-bonus">
                    +{option.bonusPercent}%
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {error ? <p className="guild-form-error">{error}</p> : null}
          <p className="dao-edit-footnote">
            Minimum {BOOST_MIN_LOCK_SOCIAL_LABEL} SOCIAL. Position belongs to
            the DAO after council approval.
          </p>
        </form>
      </OsSlideOverScreen>

      <DaoProposeConfirmSheet
        open={confirmOpen}
        title="Propose Boost?"
        body={`Lock ${amountLabel} SOCIAL for ${periodLabel} from the DAO treasury into Boost.`}
        eligibility={eligibility}
        eligibilityLoading={eligibilityLoading}
        pending={pending}
        proposeLabel="Propose"
        zIndex={DAO_BOOST_CONFIRM_Z}
        onDiscard={() => setConfirmOpen(false)}
        onPropose={() => {
          void submit();
        }}
        onStake={() => {
          setConfirmOpen(false);
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
