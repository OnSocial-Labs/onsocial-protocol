'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  AmountField,
  InfoDrawer,
  InformationCircleIcon,
  OsSheetFooter,
  OsHugSheet,
  OsIconAction,
  OsSheetAction,
  OsSheetActions,
  SheetCloseButton,
  TokenIcon,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import { TokenCreateStepThread } from '@/features/tokens/token-create-step-thread';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { useNearAccountStatus } from '@/hooks/use-near-account-status';
import {
  buildFtContractAccountId,
  defaultFtIconDataUrl,
  FT_ICON_ACCEPT,
  FT_NAME_MAX,
  FT_SYMBOL_MAX,
  getFtContractAccountError,
  getFtIconError,
  getFtParentAccountError,
  getFtSupplyError,
  normalizeFtName,
  normalizeFtSubaccountLabel,
  normalizeFtSupplyInput,
  normalizeFtSymbol,
  parseFtSupplySmallest,
} from '@/lib/app-create-token';
import {
  sendCreateUserTokenTransaction,
  sendRenounceTokenOwnerTransaction,
} from '@/lib/app-create-token-transactions';
import { prepareFtIconPngDataUrl } from '@/lib/prepare-ft-icon-png';
import { FT_CREATE_FUND_NEAR } from '@/lib/app-ft-template-config';
import { nearExplorerTxHref } from '@/lib/app-config';
import { FT_FACTORY_NOT_READY } from '@/lib/ft-factory-copy';
import {
  canFinishTakenTokenAccount,
  clearFtFactoryFinish,
  readFtFactoryFinish,
  rememberFtFactoryFinish,
  requestFtFactoryFinish,
  type FtFactoryFinishInput,
} from '@/lib/ft-factory-client';
import { SHEET_Z } from '@/lib/sheet-z';
import type { TokenCreatePhase } from '@/lib/token-create-steps';
import { txToastError, txToastSuccess } from '@/lib/transaction-toast-copy';
import { rememberUserCreatedToken } from '@/lib/user-created-tokens';
import {
  formatCreateTokenWalletError,
  isWalletUserCancellation,
} from '@/lib/wallet-errors';

function fieldId(name: string) {
  return `token-create-${name}`;
}

const TOKEN_CREATE_INFO_TITLE = 'Creator token';
const TOKEN_CREATE_INFO_SUMMARY = `${FT_CREATE_FUND_NEAR} NEAR · your own token under your wallet.`;
const TOKEN_CREATE_INFO_DETAIL =
  'Name, symbol, and supply are permanent. The contract id comes from the name — e.g. cool.you.testnet. Your wallet creates the account and funds it. We install the contract and mint to you, then remove our key. You can change the icon later until you lock admin — that ends all admin control.';

export function AppCreateTokenSheet({
  open,
  panelStyle,
  onClose,
  onCreated,
}: {
  open: boolean;
  panelStyle?: CSSProperties;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { isConnected, connect, getSigningWallet, accountId } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const formId = useId();
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('1000000');
  const [renounceOwner, setRenounceOwner] = useState(false);
  const [customIcon, setCustomIcon] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<TokenCreatePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [templateReady, setTemplateReady] = useState<boolean | null>(null);
  const [templateDetail, setTemplateDetail] = useState<string | null>(null);
  const [factoryReady, setFactoryReady] = useState<boolean | null>(null);
  const [pendingFinish, setPendingFinish] =
    useState<FtFactoryFinishInput | null>(null);

  const sheetOpen = open && !closing;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setClosing(false);
  }

  const derivedSubaccount = useMemo(
    () => normalizeFtSubaccountLabel(name || symbol),
    [name, symbol]
  );

  const contractId = useMemo(
    () =>
      accountId ? buildFtContractAccountId(accountId, derivedSubaccount) : '',
    [accountId, derivedSubaccount]
  );

  const parentError = getFtParentAccountError(accountId);
  const accountError = accountId
    ? getFtContractAccountError(accountId, derivedSubaccount)
    : '';
  const accountStatus = useNearAccountStatus(
    parentError || accountError ? '' : contractId
  );
  const supplySmallest = parseFtSupplySmallest(supply);
  const supplyError = getFtSupplyError(supply);
  // Fail closed: Available + submit only after the probe confirms the id is
  // not on-chain ('missing'). A failed/uncertain probe stays 'checking'.
  const accountTaken = accountStatus === 'found';
  const accountAvailable = accountStatus === 'missing';
  const finishing = canFinishTakenTokenAccount(pendingFinish, contractId);
  const accountChecking =
    accountStatus === 'checking' ||
    (accountStatus === 'idle' && Boolean(contractId) && !accountError);
  const accountFieldClass = finishing
    ? 'is-available'
    : accountTaken
      ? 'is-taken'
      : accountAvailable
        ? 'is-available'
        : accountChecking
          ? 'is-checking'
          : undefined;
  const accountLead = finishing
    ? 'Funded'
    : accountTaken
      ? 'Taken'
      : accountAvailable
        ? 'Available'
        : accountError && !parentError
          ? accountError
          : accountChecking
            ? 'Checking'
            : 'Under your wallet';

  const fieldsReady =
    isConnected &&
    !parentError &&
    name.trim().length >= 2 &&
    symbol.trim().length >= 1 &&
    Boolean(supplySmallest) &&
    !supplyError &&
    !accountError;
  const chainReady = templateReady === true && factoryReady === true;
  const canCreate =
    fieldsReady && accountAvailable && !pending && chainReady && !finishing;
  const canFinish = finishing && fieldsReady && !pending && chainReady;
  const canSubmit = canCreate || canFinish;
  const waitingTemplate =
    (templateReady === null || factoryReady === null) &&
    fieldsReady &&
    !finishing;

  const autoIcon = defaultFtIconDataUrl(symbol || name || 'FT');
  const icon = customIcon ?? autoIcon;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch('/api/ft-template', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        const data = (await response.json()) as {
          status?: string;
          detail?: string;
        };
        if (cancelled) return;
        const ready = data.status === 'ready';
        setTemplateReady(ready);
        setTemplateDetail(
          ready
            ? null
            : (data.detail ?? 'Token template is not ready on this network.')
        );
      })
      .catch(() => {
        if (!cancelled) {
          setTemplateReady(false);
          setTemplateDetail('Could not verify the token template.');
        }
      });
    void fetch('/api/ft-factory', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        const data = (await response.json()) as { ready?: boolean };
        if (!cancelled) setFactoryReady(data.ready === true);
      })
      .catch(() => {
        if (!cancelled) setFactoryReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPendingFinish(readFtFactoryFinish(contractId));
  }, [open, contractId]);

  // Reset on OPEN, not close: an async submit can settle after the sheet
  // closes (token still remembered on-chain), and reopening must never show
  // a stale success/error phase from that completion.
  useEffect(() => {
    if (!open) return;
    setName('');
    setSymbol('');
    setSupply('1000000');
    setRenounceOwner(false);
    setCustomIcon(null);
    setPending(false);
    setPhase('idle');
    setError(null);
  }, [open]);

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const openRef = useRef(open);
  openRef.current = open;

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const handleIconChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await prepareFtIconPngDataUrl(file);
        setCustomIcon(dataUrl);
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Use a smaller image.'
        );
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      if (!isConnected) {
        await connect();
        return;
      }
      if (templateReady !== true) {
        setError(templateDetail ?? 'Token template is not ready.');
        return;
      }
      if (factoryReady !== true) {
        setError(FT_FACTORY_NOT_READY);
        return;
      }
      if (parentError) {
        setError(parentError);
        return;
      }
      if (accountError) {
        setError(accountError);
        return;
      }
      const retryingFinish = canFinishTakenTokenAccount(
        pendingFinish,
        contractId
      );
      if (!retryingFinish && accountTaken) {
        setError('That name is taken — try another.');
        return;
      }
      if (!retryingFinish && !accountAvailable) {
        setError('Still checking that account — try again in a moment.');
        return;
      }
      if (!supplySmallest || supplyError) {
        setError(supplyError || 'Enter a total supply greater than zero.');
        return;
      }
      const tokenName = name.trim();
      const tokenSymbol = symbol.trim().toUpperCase();
      if (tokenName.length > FT_NAME_MAX) {
        setError(`Name must be ${FT_NAME_MAX} characters or fewer.`);
        return;
      }
      if (tokenSymbol.length > FT_SYMBOL_MAX) {
        setError(`Symbol must be ${FT_SYMBOL_MAX} characters or fewer.`);
        return;
      }
      const iconError = getFtIconError(icon);
      if (iconError) {
        setError(iconError);
        return;
      }

      const finishInput = (createTxHash: string): FtFactoryFinishInput => ({
        createTxHash,
        contractId,
        name: tokenName,
        symbol: tokenSymbol,
        totalSupply: supplySmallest,
        icon,
        renounceOwner,
      });

      const completeFinish = async (pendingRow: FtFactoryFinishInput) => {
        rememberFtFactoryFinish(pendingRow);
        setPendingFinish(pendingRow);
        const finished = await requestFtFactoryFinish(pendingRow);
        if (!finished.ok) {
          if (!finished.retryable) {
            clearFtFactoryFinish(pendingRow.contractId);
            setPendingFinish(null);
          }
          setTxResult({
            type: 'error',
            msg: txToastError.tokenCreateFailed,
          });
          if (!openRef.current) return;
          setPhase('finishError');
          setError(
            finished.retryable &&
              (finished.error === 'Could not create the token.' ||
                finished.error === 'Could not install the token.')
              ? 'Your account is funded. Tap Finish to install the token.'
              : finished.error
          );
          return;
        }
        let renounced = false;
        if (pendingRow.renounceOwner && openRef.current) {
          setPhase('locking');
          try {
            const lockHashes = await sendRenounceTokenOwnerTransaction(
              getSigningWallet,
              pendingRow.contractId
            );
            renounced = await trackTransaction({
              txHashes: lockHashes,
              silent: true,
              successMessage: txToastSuccess.tokenCreated,
              failureMessage: txToastError.tokenCreateFailed,
            });
          } catch {
            renounced = false;
          }
        }

        if (pendingRow.renounceOwner && !renounced) {
          rememberFtFactoryFinish(pendingRow);
          setPendingFinish(pendingRow);
        } else {
          clearFtFactoryFinish(pendingRow.contractId);
          setPendingFinish(null);
        }

        if (accountId) {
          rememberUserCreatedToken(accountId, {
            contractId: pendingRow.contractId,
            name: pendingRow.name,
            symbol: pendingRow.symbol,
            createdAt: Date.now(),
            renounced,
            icon: pendingRow.icon,
            decimals: 18,
          });
        }
        setTxResult({
          type: 'success',
          msg: txToastSuccess.tokenCreated,
          explorerHref: nearExplorerTxHref(finished.txHash),
        });
        if (!openRef.current) return;
        if (pendingRow.renounceOwner && !renounced) {
          setPhase('lockError');
          setError('Your token is live. Admin is still open.');
          onCreated?.();
          return;
        }
        setPhase('success');
        onCreated?.();
        requestClose();
      };

      setPending(true);
      try {
        if (retryingFinish && pendingFinish) {
          setPhase('confirming');
          await completeFinish(pendingFinish);
          return;
        }

        setPhase('signing');
        const txHashes = await sendCreateUserTokenTransaction(
          getSigningWallet,
          {
            contractId,
          }
        );
        setPhase('confirming');
        const confirmed = await trackTransaction({
          txHashes,
          silent: true,
          successMessage: txToastSuccess.tokenCreated,
          failureMessage: txToastError.tokenCreateFailed,
        });
        if (!confirmed) {
          const createTxHash = txHashes.find(Boolean) ?? '';
          if (createTxHash) {
            const pendingRow = finishInput(createTxHash);
            rememberFtFactoryFinish(pendingRow);
            setPendingFinish(pendingRow);
          }
          setTxResult({
            type: 'error',
            msg: txToastError.tokenCreateFailed,
          });
          if (!openRef.current) return;
          setPhase('error');
          setError(
            createTxHash
              ? 'Your account may be funded. Tap Finish to install the token.'
              : txToastError.tokenCreateFailed
          );
          return;
        }
        await completeFinish(finishInput(txHashes.find(Boolean) ?? ''));
      } catch (cause) {
        setPhase('error');
        if (isWalletUserCancellation(cause)) {
          setPhase('idle');
          return;
        }
        setError(
          formatCreateTokenWalletError(cause, txToastError.tokenCreateFailed)
        );
        setTxResult({
          type: 'error',
          msg: txToastError.tokenCreateFailed,
        });
      } finally {
        setPending(false);
      }
    },
    [
      accountAvailable,
      accountError,
      accountId,
      accountTaken,
      connect,
      contractId,
      factoryReady,
      getSigningWallet,
      icon,
      isConnected,
      name,
      onCreated,
      parentError,
      pendingFinish,
      renounceOwner,
      requestClose,
      setTxResult,
      supplySmallest,
      supplyError,
      symbol,
      templateDetail,
      templateReady,
      trackTransaction,
    ]
  );

  return (
    <>
      <OsHugSheet
        open={sheetOpen}
        onClose={requestClose}
        onClosed={handleClosed}
        chrome="choice"
        label="Create token"
        copy={`Your creator token · ${FT_CREATE_FUND_NEAR} NEAR`}
        closeAriaLabel="Close"
        backdropLabel="Close create token"
        zIndex={SHEET_Z.nested}
        panelClassName="account-storage-panel os-sheet-cap-tall"
        headerActions={
          <div className="standing-sheet-actions">
            <OsIconAction
              ariaLabel="About creator tokens"
              onClick={() => setInfoOpen(true)}
              disabled={pending}
            >
              <InformationCircleIcon
                className="glass-sheet-close-icon"
                aria-hidden
              />
            </OsIconAction>
            <SheetCloseButton onClick={requestClose} ariaLabel="Close" />
          </div>
        }
        {...(panelStyle ? { panelStyle } : {})}
        footer={
          <OsSheetFooter>
            <OsSheetActions layout="stack" tone="frosted-primary" borderless>
              <OsSheetAction
                type="submit"
                form={formId}
                ready={canSubmit}
                pending={pending || waitingTemplate}
                pendingLabel={
                  waitingTemplate
                    ? 'Checking…'
                    : phase === 'locking'
                      ? 'Locking…'
                      : phase === 'confirming'
                        ? 'Confirming…'
                        : 'Signing…'
                }
                disabled={pending || waitingTemplate || !canSubmit}
              >
                {canFinish ? 'Finish' : 'Create'}
              </OsSheetAction>
            </OsSheetActions>
          </OsSheetFooter>
        }
      >
        <form
          id={formId}
          className="app-storage-sheet token-create-form"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {templateReady === false ? (
            <p className="token-create-note is-warn" role="status">
              {templateDetail}
            </p>
          ) : factoryReady === false ? (
            <p className="token-create-note is-warn" role="status">
              {FT_FACTORY_NOT_READY}
            </p>
          ) : null}
          {parentError ? (
            <p className="token-create-note is-warn" role="status">
              {parentError}
            </p>
          ) : null}

          <div className="token-create-name-row">
            <button
              type="button"
              className="token-create-icon-pick"
              disabled={pending}
              aria-label="Choose icon"
              onClick={() => iconInputRef.current?.click()}
            >
              <TokenIcon src={icon} label={symbol || name || 'FT'} size="md" />
            </button>
            <input
              ref={iconInputRef}
              type="file"
              accept={FT_ICON_ACCEPT}
              className="token-create-icon-input"
              tabIndex={-1}
              aria-hidden
              disabled={pending}
              onChange={(event) => void handleIconChange(event)}
            />
            <label className="guild-field" htmlFor={fieldId('name')}>
              <span>Name</span>
              <input
                id={fieldId('name')}
                value={name}
                onChange={(event) =>
                  setName(normalizeFtName(event.target.value))
                }
                placeholder="Cool Token"
                maxLength={FT_NAME_MAX}
                disabled={pending}
                autoComplete="off"
                className={osFieldBorderedClassName}
              />
            </label>
          </div>

          <label className="guild-field" htmlFor={fieldId('symbol')}>
            <span>Symbol</span>
            <input
              id={fieldId('symbol')}
              value={symbol}
              onChange={(event) =>
                setSymbol(normalizeFtSymbol(event.target.value))
              }
              placeholder="COOL"
              maxLength={FT_SYMBOL_MAX}
              disabled={pending}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className={osFieldBorderedClassName}
            />
          </label>

          <div className="guild-field">
            <span id={fieldId('supply-label')}>Supply</span>
            <AmountField
              id={fieldId('supply')}
              aria-label="Total supply"
              value={supply}
              onValueChange={(raw) => setSupply(normalizeFtSupplyInput(raw))}
              maxDecimals={0}
              unit={symbol.trim() || 'tokens'}
              placeholder="1000000"
              disabled={pending}
              invalid={Boolean(supply.trim() && supplyError)}
            />
            <small>
              {supplyError
                ? supplyError
                : supply.trim()
                  ? 'Minted to you'
                  : 'Enter total supply'}
            </small>
          </div>

          <div className="guild-field" role="status">
            <span>Contract</span>
            <p
              className={`token-create-contract-id dao-create-mono${
                accountFieldClass ? ` ${accountFieldClass}` : ''
              }`}
            >
              {contractId ||
                (accountId ? `${derivedSubaccount || '…'}.${accountId}` : '…')}
            </p>
            <small className={accountFieldClass}>{accountLead}</small>
          </div>

          <label className="dao-create-toggle">
            <input
              type="checkbox"
              checked={renounceOwner}
              onChange={(event) => setRenounceOwner(event.target.checked)}
              disabled={pending}
            />
            <span>
              Lock admin
              <small>Freeze icon, ownership, and reference.</small>
            </span>
          </label>

          {phase !== 'idle' ? (
            <TokenCreateStepThread phase={phase} includeLock={renounceOwner} />
          ) : null}

          {error ? (
            <p className="token-create-note is-warn" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </OsHugSheet>
      <InfoDrawer
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={TOKEN_CREATE_INFO_TITLE}
        summary={TOKEN_CREATE_INFO_SUMMARY}
        detail={TOKEN_CREATE_INFO_DETAIL}
        zIndex={SHEET_Z.nestedConfirm}
      />
    </>
  );
}
