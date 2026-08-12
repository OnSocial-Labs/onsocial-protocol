'use client';

import { useCallback, useMemo, type ChangeEvent } from 'react';
import {
  ChevronDownIcon,
  FloatingPanelMenu,
  OsSheetAction,
  OsSheetActions,
  PulsingDots,
  osFloatingPanelItemClassName,
  osFloatingPanelItemSelectedClassName,
  osFloatingPanelTriggerChevronClassName,
  osFloatingPanelTriggerClassName,
  osFloatingPanelTriggerLabelClassName,
  useDropdown,
} from '@onsocial/ui';
import { AppSocialSwapQuoteDetails } from '@/components/wallet/app-social-swap-quote-details';
import { TokenIcon } from '@/components/ui/token-icon';
import { useAppSocialBalance } from '@/contexts/app-social-balance-context';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useAppSwap } from '@/hooks/use-app-swap';
import { useSwapTokenIcons } from '@/hooks/use-swap-token-icons';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
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

  const handleAmountChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      swap.setAmountIn(
        normalizeAmountInput(event.target.value, amountMaxDecimals)
      );
    },
    [amountMaxDecimals, swap]
  );

  const handleAmountBlur = useCallback(() => {
    swap.setAmountIn(finalizeAmountInput(swap.amountIn, amountMaxDecimals));
  }, [amountMaxDecimals, swap]);

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
      <div className="app-swap-form">
        <p className="app-swap-testnet-copy">
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
      </div>
    );
  }

  const primaryLabel = !isConnected
    ? isWalletBootstrapping
      ? 'Connecting…'
      : 'Connect wallet'
    : swap.swapping
      ? 'Getting SOCIAL…'
      : 'Get SOCIAL';

  const primaryReady =
    (!isConnected && !isWalletBootstrapping) ||
    (isConnected && swap.canSwap && !swap.swapping);

  return (
    <div className="app-swap-form">
      <div className="app-swap-leg">
        <div className="app-swap-leg-head">
          <span className="app-swap-leg-label">You pay</span>
          {inputBalanceLabel != null ? (
            <button
              type="button"
              className="os-surface-chip app-storage-preset--action"
              onClick={swap.setMaxAmount}
              disabled={!swap.maxAmount || swap.maxAmount === '0'}
            >
              Max {inputBalanceLabel} {paySymbol}
            </button>
          ) : null}
        </div>
        <div className="app-storage-amount-field app-swap-amount-field">
          <input
            className="app-storage-amount-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={swap.amountIn}
            onChange={handleAmountChange}
            onBlur={handleAmountBlur}
            aria-label={`Amount in ${paySymbol}`}
          />
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
        </div>
      </div>

      <div className="app-swap-leg">
        <div className="app-swap-leg-head">
          <span className="app-swap-leg-label">You get</span>
          {outputBalanceLabel != null ? (
            <span className="app-swap-balance-meta">
              Balance {outputBalanceLabel} SOCIAL
            </span>
          ) : null}
        </div>
        <div className="app-storage-amount-field app-swap-amount-field is-output">
          {receiveLoading ? (
            <span className="app-swap-receive-loading">
              <PulsingDots size="sm" label="Estimating SOCIAL" />
            </span>
          ) : (
            <span className="app-storage-amount-input app-swap-receive-value">
              {swap.amountOut || '0'}
            </span>
          )}
          <span className="app-swap-token-static">
            <TokenIcon src={tokenIcons.socialIcon} label="SOCIAL" />
            <span>SOCIAL</span>
          </span>
        </div>
      </div>

      {swap.swapHint ? (
        <p className="app-swap-hint">{appSwapHintMessage(swap.swapHint)}</p>
      ) : null}
      {swap.error ? <p className="app-swap-error">{swap.error}</p> : null}

      <AppSocialSwapQuoteDetails
        quote={swap.quote}
        estimating={swap.estimating || swap.refreshingQuote}
        amountIn={swap.amountIn}
      />

      <OsSheetActions layout="stack" tone="frosted-primary" borderless>
        <OsSheetAction
          type="button"
          variant="primary"
          ready={primaryReady}
          disabled={!primaryReady}
          onClick={() => void handleSwap()}
        >
          {swap.swapping ? (
            <PulsingDots size="sm" label="Getting SOCIAL" />
          ) : (
            primaryLabel
          )}
        </OsSheetAction>
      </OsSheetActions>

      <p className="app-swap-caption">
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
    </div>
  );
}
