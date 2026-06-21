'use client';

import { useCallback, useEffect, useMemo, type ChangeEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Info } from 'lucide-react';

import { ProtocolFlowDivider } from '@/components/ui/protocol-flow-divider';
import { ProtocolMotionArrow } from '@/components/ui/protocol-motion-arrow';

import { SocialSwapQuoteDetails } from '@/components/social-swap-quote-details';
import { Button, buttonArrowRightClass } from '@/components/ui/button';
import { portalConnectButtonLabel, portalConnectCtaLabel } from '@/lib/portal-connect-copy';
import {
  ModalFactRow,
  ModalFactSection,
} from '@/components/ui/modal-fact-list';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import {
  floatingPanelClass,
  floatingPanelItemClass,
  floatingPanelItemSelectedClass,
} from '@/components/ui/floating-panel';
import { FloatingPanelMenu } from '@/components/ui/floating-panel-menu';
import { TokenIcon } from '@/components/ui/token-icon';
import { TransactionFeedbackToast } from '@/components/ui/transaction-feedback-toast';
import { useDropdown } from '@/hooks/use-dropdown';
import { useNearTransactionFeedback } from '@/hooks/use-near-transaction-feedback';
import { usePortalSwap } from '@/hooks/use-portal-swap';
import { useSwapTokenIcons } from '@/hooks/use-swap-token-icons';
import { useWallet } from '@/contexts/wallet-context';
import { finalizeAmountInput, normalizeAmountInput } from '@/lib/amount-input';
import {
  PORTAL_SWAP_ENABLED,
  portalSwapAmountMaxDecimals,
  SOCIAL_RHEA_POOLS,
  type PortalSwapInputKind,
} from '@/lib/portal-swap-config';
import {
  isWalletUserCancellation,
  reportWalletActionFailure,
} from '@/lib/wallet-errors';
import {
  formatSwapDetailAmount,
  humanizeSwapTransactionError,
} from '@/lib/portal-swap-quote';
import {
  txToastError,
  txToastPending,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { portalSwapHintMessage } from '@/lib/portal-swap-validation';
import { cn } from '@/lib/utils';

const PANEL_EASE = [0.25, 0.1, 0.25, 1] as const;

const SWAP_AMOUNT_TEXT_CLASS =
  'font-mono text-lg font-semibold tracking-[-0.02em]';

const SWAP_RELATED_LINK_CLASS =
  'group inline-flex items-center gap-0.5 font-medium text-muted-foreground/75 transition-colors hover:text-foreground';

const PAY_TOKEN_OPTIONS = [
  { kind: 'near', label: 'NEAR' },
  { kind: 'usdc', label: 'USDC' },
] as const satisfies ReadonlyArray<{
  kind: PortalSwapInputKind;
  label: string;
}>;

function formatInputBalance(
  balance: string | null,
  decimals: number,
  symbol: string
): string | null {
  if (balance == null) return null;
  try {
    const refDecimals = symbol === 'NEAR' ? 24 : decimals;
    const divisor = 10n ** BigInt(refDecimals);
    const whole = BigInt(balance) / divisor;
    const frac = BigInt(balance) % divisor;
    const fracStr = frac
      .toString()
      .padStart(refDecimals, '0')
      .slice(0, 4)
      .replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return null;
  }
}

export function SocialSwapPanel({
  defaultTokenIn = 'near',
  onSuccess,
  className,
}: {
  defaultTokenIn?: PortalSwapInputKind;
  onSuccess?: () => void;
  className?: string;
}) {
  const { accountId, connect, getSigningWallet, isConnected, isLoading: isWalletBootstrapping } = useWallet();
  const { txResult, setTxResult, clearTxResult, trackTransaction } =
    useNearTransactionFeedback(accountId);
  const swap = usePortalSwap(accountId);
  const tokenIcons = useSwapTokenIcons(PORTAL_SWAP_ENABLED);
  const tokenMenu = useDropdown();
  const paySymbol = swap.tokenIn === 'near' ? 'NEAR' : 'USDC';
  const amountMaxDecimals = portalSwapAmountMaxDecimals(swap.tokenIn);

  const handleAmountChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      swap.setAmountIn(
        normalizeAmountInput(event.target.value, amountMaxDecimals)
      );
    },
    [amountMaxDecimals, swap.setAmountIn]
  );

  const handleAmountBlur = useCallback(() => {
    swap.setAmountIn(finalizeAmountInput(swap.amountIn, amountMaxDecimals));
  }, [amountMaxDecimals, swap.amountIn, swap.setAmountIn]);

  const selectPayToken = useCallback(
    (kind: PortalSwapInputKind) => {
      if (kind === swap.tokenIn) {
        tokenMenu.close();
        return;
      }
      swap.setTokenIn(kind);
      swap.setAmountIn('');
      swap.setError(null);
      tokenMenu.close();
    },
    [swap, tokenMenu]
  );

  useEffect(() => {
    swap.setTokenIn(defaultTokenIn);
    swap.setAmountIn('');
    swap.setError(null);
  }, [defaultTokenIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputBalanceLabel = useMemo(() => {
    if (swap.inputBalance == null) return null;
    const decimals = swap.tokenIn === 'near' ? 24 : 6;
    const symbol = swap.tokenIn === 'near' ? 'NEAR' : 'USDC';
    return formatInputBalance(swap.inputBalance, decimals, symbol);
  }, [swap.inputBalance, swap.tokenIn]);

  const outputBalanceLabel = useMemo(() => {
    if (swap.socialBalance == null) return null;
    return formatInputBalance(swap.socialBalance, 18, 'SOCIAL');
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

  const swapFlowArrowExpanded = useMemo(
    () => !receiveLoading && Boolean(swap.quote),
    [receiveLoading, swap.quote]
  );

  const handleSwap = useCallback(async () => {
    if (!PORTAL_SWAP_ENABLED) return;
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
        onFailure: (message) => swap.setError(message),
      });
      if (confirmed) {
        await swap.resetAfterSwap();
        onSuccess?.();
      }
    } catch (err) {
      if (!isWalletUserCancellation(err)) {
        reportWalletActionFailure(err, (message) => {
          const friendly = humanizeSwapTransactionError(message);
          swap.setError(friendly);
          setTxResult({ type: 'error', msg: friendly });
        });
      }
    }
  }, [
    connect,
    getSigningWallet,
    isConnected,
    onSuccess,
    setTxResult,
    swap,
    trackTransaction,
  ]);

  return (
    <>
      <TransactionFeedbackToast result={txResult} onClose={clearTxResult} />
      <div className={cn('space-y-3', className)}>
        {!PORTAL_SWAP_ENABLED ? (
          <div className="space-y-4">
            <ModalFactSection title="On testnet" dense>
              <ModalFactRow
                label="SOCIAL"
                value="Ask ops or your team faucet, then join the rally."
                multiline
              />
            </ModalFactSection>

            <div
              className="h-px w-full shrink-0 divider-section"
              role="separator"
              aria-hidden
            />

            <ModalFactSection title="On mainnet" dense>
              <ModalFactRow
                label="Rhea"
                value="Pick up SOCIAL when you are on mainnet."
                multiline
              />
              <div className="flex flex-wrap gap-2 pt-2">
                {SOCIAL_RHEA_POOLS.map((pool) => (
                  <Button
                    key={pool.poolId}
                    asChild
                    size="sm"
                    variant="default"
                    className="gap-1.5"
                  >
                    <a
                      href={pool.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {pool.label}
                      <ProtocolMotionArrow
                        className={cn('h-3 w-3', buttonArrowRightClass)}
                      />
                    </a>
                  </Button>
                ))}
              </div>
            </ModalFactSection>
          </div>
        ) : (
          <>
            <div
              className={cn(
                floatingPanelClass,
                'overflow-hidden',
                swap.swapHint && 'border-[var(--portal-amber-border)]'
              )}
            >
              <div className="px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Use
                </span>
                <div className="mt-1 flex min-h-7 items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={swap.amountIn}
                    onChange={handleAmountChange}
                    onBlur={handleAmountBlur}
                    placeholder="0"
                    className={cn(
                      'min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground ring-offset-background [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
                      SWAP_AMOUNT_TEXT_CLASS
                    )}
                  />
                  <div
                    className="relative flex shrink-0 items-center gap-2"
                    ref={tokenMenu.containerRef}
                  >
                    <div
                      className="h-5 w-px shrink-0 divider-v-section"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      disabled={swap.swapping}
                      onClick={tokenMenu.toggle}
                      aria-expanded={tokenMenu.isOpen}
                      aria-haspopup="listbox"
                      aria-label={
                        tokenMenu.isOpen
                          ? 'Close use token menu'
                          : `Open use token menu, ${paySymbol}`
                      }
                      className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm font-medium text-foreground transition-colors hover:bg-background/60 disabled:opacity-50"
                    >
                      <TokenIcon
                        src={tokenIcons.inputIcon(swap.tokenIn)}
                        label={paySymbol}
                        size="sm"
                      />
                      <span>{paySymbol}</span>
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 text-muted-foreground transition-transform',
                          tokenMenu.isOpen && 'rotate-180'
                        )}
                      />
                    </button>
                    <FloatingPanelMenu
                      open={tokenMenu.isOpen}
                      align="right"
                      className="z-50 w-48"
                      role="listbox"
                      aria-label="Use token"
                    >
                      <div className="border-b border-fade-section px-3 py-2.5">
                        <p className="mb-0.5 whitespace-nowrap portal-type-label text-muted-foreground/70">
                          Use
                        </p>
                        <p className="whitespace-nowrap portal-type-body font-medium text-foreground">
                          {paySymbol}
                        </p>
                      </div>

                      <div className="space-y-0.5 p-1.5">
                        {PAY_TOKEN_OPTIONS.map((option) => {
                          const selected = swap.tokenIn === option.kind;
                          return (
                            <button
                              key={option.kind}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              onClick={() => selectPayToken(option.kind)}
                              className={cn(
                                'group',
                                floatingPanelItemClass,
                                selected && floatingPanelItemSelectedClass
                              )}
                            >
                              <TokenIcon
                                src={tokenIcons.inputIcon(option.kind)}
                                label={option.label}
                                size="sm"
                              />
                              <span>{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </FloatingPanelMenu>
                  </div>
                </div>
                <div className="mt-1 flex min-h-4 items-center justify-between gap-2">
                  <AnimatePresence initial={false} mode="wait">
                    {inputBalanceLabel ? (
                      <motion.p
                        key={`${swap.tokenIn}-${inputBalanceLabel}`}
                        initial={{ opacity: 0, y: -3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 3 }}
                        transition={{ duration: 0.18, ease: PANEL_EASE }}
                        className="text-xs text-muted-foreground"
                      >
                        Balance: {inputBalanceLabel}{' '}
                        {swap.tokenIn === 'near' ? 'NEAR' : 'USDC'}
                      </motion.p>
                    ) : (
                      <span />
                    )}
                  </AnimatePresence>
                  {isConnected &&
                  swap.maxAmount &&
                  swap.maxAmount !== '0' &&
                  !swap.swapping ? (
                    <button
                      type="button"
                      onClick={() => swap.setMaxAmount()}
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Max
                    </button>
                  ) : null}
                </div>
                <AnimatePresence initial={false}>
                  {isConnected && swap.swapHint ? (
                    <motion.div
                      key={swap.swapHint}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18, ease: PANEL_EASE }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 flex items-start gap-2 text-xs text-amber-500/90">
                        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span>{portalSwapHintMessage(swap.swapHint)}</span>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="relative px-3 py-1.5" aria-hidden="true">
                <ProtocolFlowDivider active={swapFlowArrowExpanded} />
                <div className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border/40 bg-background/95 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.45)]">
                  <ProtocolMotionArrow
                    direction="down"
                    expanded={swapFlowArrowExpanded}
                    className="h-3 w-3 text-[var(--portal-gold)]/80"
                  />
                </div>
              </div>

              <div className="px-3 py-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Receive
                </span>
                <div className="mt-1 flex min-h-7 items-center justify-between gap-2">
                  <AnimatePresence initial={false} mode="wait">
                    {receiveLoading ? (
                      <motion.div
                        key="estimating"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.18, ease: PANEL_EASE }}
                        className="flex min-h-7 items-center"
                      >
                        <PulsingDots
                          size="sm"
                          className="text-muted-foreground"
                        />
                      </motion.div>
                    ) : (
                      <motion.p
                        key={swap.amountOut || 'empty'}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.22, ease: PANEL_EASE }}
                        className={cn(
                          SWAP_AMOUNT_TEXT_CLASS,
                          'text-foreground'
                        )}
                      >
                        {formatSwapDetailAmount(swap.amountOut || '0', 6)}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                    <TokenIcon
                      src={tokenIcons.socialIcon}
                      label="SOCIAL"
                      size="sm"
                    />
                    SOCIAL
                  </span>
                </div>
                <div className="mt-1 flex min-h-4 items-center">
                  <AnimatePresence initial={false} mode="wait">
                    {isConnected && outputBalanceLabel ? (
                      <motion.p
                        key={outputBalanceLabel}
                        initial={{ opacity: 0, y: -3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 3 }}
                        transition={{ duration: 0.18, ease: PANEL_EASE }}
                        className="text-xs text-muted-foreground"
                      >
                        Balance: {outputBalanceLabel} SOCIAL
                      </motion.p>
                    ) : (
                      <span />
                    )}
                  </AnimatePresence>
                </div>
              </div>
              {(swap.quote || receiveLoading) && (
                <>
                  <div
                    className="h-px w-full divider-section"
                    aria-hidden="true"
                  />
                  <div className="px-3 py-2">
                    <SocialSwapQuoteDetails
                      quote={swap.quote}
                      estimating={receiveLoading}
                      amountIn={swap.amountIn}
                      embedded
                    />
                  </div>
                </>
              )}
            </div>

            {swap.error ? (
              <p className="text-sm text-[var(--portal-red)]">{swap.error}</p>
            ) : null}

            <Button
              variant="accent"
              size="cta"
              className="w-full"
              disabled={isWalletBootstrapping || (!swap.canSwap && isConnected)}
              loading={swap.swapping || isWalletBootstrapping}
              onClick={() => void handleSwap()}
            >
              {portalConnectButtonLabel('swap', {
                isWalletBootstrapping,
                isConnected,
                connectedLabel: swap.loadingPools ? 'Loading pools…' : 'Get SOCIAL',
              })}
            </Button>
          </>
        )}

        {PORTAL_SWAP_ENABLED ? (
          <nav
            aria-label="Swap related links"
            className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-fade-section pt-2.5 portal-type-caption"
          >
            <span className="portal-eyebrow-wide shrink-0 text-muted-foreground/50">
              Rhea
            </span>
            {SOCIAL_RHEA_POOLS.map((pool, index) => (
              <span
                key={pool.poolId}
                className="inline-flex items-center gap-2"
              >
                {index > 0 ? (
                  <span aria-hidden="true" className="text-muted-foreground/30">
                    ·
                  </span>
                ) : null}
                <a
                  href={pool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={SWAP_RELATED_LINK_CLASS}
                >
                  {pool.label}
                  <ProtocolMotionArrow className="h-2 w-2 shrink-0 text-muted-foreground/50" />
                </a>
              </span>
            ))}
            <span aria-hidden="true" className="text-muted-foreground/30">
              ·
            </span>
            <Link href="/transparency" className={SWAP_RELATED_LINK_CLASS}>
              Token transparency
              <ProtocolMotionArrow className="h-2 w-2 shrink-0 text-muted-foreground/50" />
            </Link>
          </nav>
        ) : null}
      </div>
    </>
  );
}
