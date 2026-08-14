'use client';

import { useCallback, useMemo } from 'react';
import {
  AmountField,
  AmountFieldMetaRow,
  ChevronDownIcon,
  FloatingPanelMenu,
  OsSheetActions,
  PulsingDots,
  osFloatingPanelItemClassName,
  osFloatingPanelItemSelectedClassName,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  useDropdown,
} from '@onsocial/ui';
import { OsSheetAction } from '@onsocial/ui';
import { AppSocialSwapQuoteDetails } from '@/components/wallet/app-social-swap-quote-details';
import { TokenIcon } from '@/components/ui/token-icon';
import { useAppSocialBalance } from '@/contexts/app-social-balance-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppSwap } from '@/hooks/use-app-swap';
import { useSwapTokenIcons } from '@/hooks/use-swap-token-icons';
import {
  APP_SWAP_ENABLED,
  SOCIAL_RHEA_POOLS,
  appSwapAmountMaxDecimals,
  type AppSwapInputKind,
} from '@/lib/app-swap-config';
import { formatSwapInputBalance } from '@/lib/app-swap-format';
import { humanizeSwapTransactionError } from '@/lib/app-swap-quote';
import { appSwapHintMessage } from '@/lib/app-swap-validation';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const PAY_TOKEN_OPTIONS = [
  { kind: 'near', label: 'NEAR' },
  { kind: 'usdc', label: 'USDC' },
] as const satisfies ReadonlyArray<{
  kind: AppSwapInputKind;
  label: string;
}>;

interface AppSocialSwapFormProps {
  onSuccess?: () => void;
}

export function AppSocialSwapForm({ onSuccess }: AppSocialSwapFormProps) {
  const {
    accountId,
    connect,
    getSigningWallet,
    isConnected,
    isLoading: isWalletBootstrapping,
  } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const { refresh: refreshSocialBalance } = useAppSocialBalance();
  const swap = useAppSwap(accountId);
  const tokenIcons = useSwapTokenIcons(APP_SWAP_ENABLED);
  const {
    isOpen: tokenMenuOpen,
    toggle: toggleTokenMenu,
    close: closeTokenMenu,
    containerRef: tokenMenuContainerRef,
    panelRef: tokenMenuPanelRef,
  } = useDropdown();
  const paySymbol = swap.tokenIn === 'near' ? 'NEAR' : 'USDC';
  const amountMaxDecimals = appSwapAmountMaxDecimals(swap.tokenIn);

  const selectPayToken = useCallback(
    (kind: AppSwapInputKind) => {
      if (kind === swap.tokenIn) {
        closeTokenMenu();
        return;
      }
      swap.setTokenIn(kind);
      swap.setAmountIn('');
      swap.setError(null);
      closeTokenMenu();
    },
    [closeTokenMenu, swap]
  );

  const inputBalanceLabel = useMemo(() => {
    if (swap.inputBalance == null) return null;
    const decimals = swap.tokenIn === 'near' ? 24 : 6;
    return formatSwapInputBalance(swap.inputBalance, decimals, paySymbol);
  }, [paySymbol, swap.inputBalance, swap.tokenIn]);

  const outputBalanceLabel = useMemo(() => {
    if (swap.socialBalance == null) return null;
    return formatSwapInputBalance(swap.socialBalance, 18, 'SOCIAL');
  }, [swap.socialBalance]);

  const receiveLoading = useMemo(() => {
    const trimmed = swap.amountIn.trim();
    return (
      swap.estimating ||
      swap.refreshingQuote ||
      (Boolean(trimmed) &&
        Number(trimmed) > 0 &&
        !swap.amountOut &&
        !swap.error)
    );
  }, [
    swap.amountIn,
    swap.amountOut,
    swap.error,
    swap.estimating,
    swap.refreshingQuote,
  ]);

  const handleSwap = useCallback(async () => {
    if (!APP_SWAP_ENABLED) return;
    if (!isConnected) {
      await connect();
      return;
    }
    try {
      const transactions = await swap.prepareSwapTransactions();
      const { wallet, accountId: signerId } = await getSigningWallet();
      const txHashes = await swap.signPreparedSwap(
        wallet,
        signerId,
        transactions
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastPending.swappingSocial,
        successMessage: txToastSuccess.socialInWallet,
        failureMessage: txToastError.swapFailed,
        onFailure: (message) => {
          swap.setError(humanizeSwapTransactionError(message));
        },
      });
      if (confirmed) {
        await swap.resetAfterSwap();
        await refreshSocialBalance({ silent: true, retry: true });
        onSuccess?.();
      }
    } catch (err) {
      if (isWalletUserCancellation(err)) {
        setTxResult(null);
        return;
      }
      const message = humanizeSwapTransactionError(
        err instanceof Error ? err.message : 'Swap failed.'
      );
      swap.setError(message);
      setTxResult({ type: 'error', msg: message });
    }
  }, [
    connect,
    getSigningWallet,
    isConnected,
    onSuccess,
    refreshSocialBalance,
    setTxResult,
    swap,
    trackTransaction,
  ]);

  if (!APP_SWAP_ENABLED) {
    return (
      <section className="app-storage-section app-swap-form">
        <p className="app-storage-hint app-swap-testnet-copy">
          Get SOCIAL via Rhea is mainnet-only. Run the app with{' '}
          <code>pnpm --filter @onsocial/app run dev:mainnet</code> to try it
          locally.
        </p>
        <ul className="app-swap-pool-links">
          {SOCIAL_RHEA_POOLS.map((pool) => (
            <li key={pool.poolId}>
              <a href={pool.href} target="_blank" rel="noreferrer">
                {pool.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const primaryLabel = !isConnected ? 'Connect wallet' : 'Get SOCIAL';
  const primaryPending = !isConnected ? isWalletBootstrapping : swap.swapping;
  const primaryReady =
    (!isConnected && !isWalletBootstrapping) ||
    (isConnected && swap.canSwap && !swap.swapping);

  const payTokenTrailing = (
    <div className="app-swap-token-picker" ref={tokenMenuContainerRef}>
      <button
        type="button"
        className={`${osFloatingPanelTriggerClassName}${tokenMenuOpen ? ' is-open' : ''}`}
        onClick={toggleTokenMenu}
        aria-haspopup="listbox"
        aria-expanded={tokenMenuOpen}
      >
        <TokenIcon
          src={tokenIcons.inputIcon(swap.tokenIn)}
          label={paySymbol}
        />
        <span className={osFloatingPanelTriggerLabelClassName}>
          {paySymbol}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={osFloatingPanelTriggerChevronClassName}
        />
      </button>
      <FloatingPanelMenu
        ref={tokenMenuPanelRef}
        open={tokenMenuOpen}
        align="right"
        role="listbox"
        aria-label="Pay with"
      >
        {PAY_TOKEN_OPTIONS.map((option) => {
          const selected = option.kind === swap.tokenIn;
          return (
            <button
              key={option.kind}
              type="button"
              role="option"
              aria-selected={selected}
              className={`${osFloatingPanelItemClassName}${
                selected ? ` ${osFloatingPanelItemSelectedClassName}` : ''
              }`}
              onClick={() => selectPayToken(option.kind)}
            >
              <TokenIcon
                src={tokenIcons.inputIcon(option.kind)}
                label={option.label}
              />
              <span>{option.label}</span>
            </button>
          );
        })}
      </FloatingPanelMenu>
    </div>
  );

  return (
    <section className="app-storage-section app-swap-form">
      <div className="app-swap-leg">
        <div className="app-swap-leg-head">
          <span className="app-swap-leg-label">You pay</span>
        </div>
        <AmountField
          className="app-swap-amount-field"
          value={swap.amountIn}
          onValueChange={swap.setAmountIn}
          maxDecimals={amountMaxDecimals}
          placeholder="0"
          aria-label={`Amount in ${paySymbol}`}
          trailing={payTokenTrailing}
        />
        <AmountFieldMetaRow
          max={{
            onClick: swap.setMaxAmount,
            disabled: !swap.maxAmount || swap.maxAmount === '0',
            variant: 'action',
          }}
          meta={
            inputBalanceLabel != null
              ? `Wallet ${inputBalanceLabel} ${paySymbol}`
              : '\u00a0'
          }
        />
      </div>

      <div className="app-swap-leg">
        <div className="app-swap-leg-head">
          <span className="app-swap-leg-label">You get</span>
        </div>
        <AmountField
          className="app-swap-amount-field is-output"
          aria-label="SOCIAL you get"
          display={
            receiveLoading ? (
              <span className="app-swap-receive-loading">
                <PulsingDots size="sm" label="Estimating SOCIAL" />
              </span>
            ) : (
              <span className="app-storage-amount-input app-swap-receive-value">
                {swap.amountOut || '0'}
              </span>
            )
          }
          trailing={
            <span className="app-swap-token-static">
              <TokenIcon src={tokenIcons.socialIcon} label="SOCIAL" />
              <span className="account-card-balance-unit">SOCIAL</span>
            </span>
          }
        />
        {outputBalanceLabel != null ? (
          <p className="app-storage-amount-meta">
            Balance {outputBalanceLabel} SOCIAL
          </p>
        ) : null}
      </div>

      {swap.swapHint ? (
        <p className="app-storage-hint app-swap-hint">
          {appSwapHintMessage(swap.swapHint)}
        </p>
      ) : null}
      {swap.error ? (
        <p className="app-storage-error" role="alert">
          {swap.error}
        </p>
      ) : null}

      <AppSocialSwapQuoteDetails
        quote={swap.quote}
        estimating={swap.estimating || swap.refreshingQuote}
        amountIn={swap.amountIn}
      />

      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          ready={primaryReady}
          pending={primaryPending}
          pendingLabel={!isConnected ? 'Connecting…' : 'Getting SOCIAL…'}
          disabled={primaryPending || (isConnected && !swap.canSwap)}
          onClick={() => void handleSwap()}
        >
          {primaryLabel}
        </OsSheetAction>
      </OsSheetActions>

      <p className="app-storage-hint app-swap-caption">
        Via Rhea ·{' '}
        {SOCIAL_RHEA_POOLS.map((pool, index) => (
          <span key={pool.poolId}>
            {index > 0 ? ' · ' : null}
            <a href={pool.href} target="_blank" rel="noreferrer">
              {pool.label}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}
