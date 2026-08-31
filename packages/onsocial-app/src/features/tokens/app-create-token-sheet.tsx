'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  InfoDrawer,
  InformationCircleIcon,
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
import { sendCreateUserTokenTransaction } from '@/lib/app-create-token-transactions';
import { prepareFtIconPngDataUrl } from '@/lib/prepare-ft-icon-png';
import { FT_CREATE_FUND_NEAR } from '@/lib/app-ft-template-config';
import { SHEET_Z } from '@/lib/sheet-z';
import type { TokenCreatePhase } from '@/lib/token-create-steps';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { rememberUserCreatedToken } from '@/lib/user-created-tokens';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function fieldId(name: string) {
  return `token-create-${name}`;
}

const TOKEN_CREATE_INFO_TITLE = 'Creator token';
const TOKEN_CREATE_INFO_SUMMARY = `${FT_CREATE_FUND_NEAR} NEAR · your own token under your wallet.`;
const TOKEN_CREATE_INFO_DETAIL =
  'Name, symbol, and supply are permanent. Contract id comes from the name — e.g. cool.you.testnet. One batch: create account, fund, deploy contract, mint to you. You can change the icon later. Lock admin freezes name and icon forever.';

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
  const accountChecking =
    accountStatus === 'checking' ||
    (accountStatus === 'idle' && Boolean(contractId) && !accountError);
  const accountFieldClass = accountTaken
    ? 'is-taken'
    : accountAvailable
      ? 'is-available'
      : accountChecking
        ? 'is-checking'
        : undefined;
  const accountLead = accountTaken
    ? 'Taken'
    : accountAvailable
      ? 'Available'
      : accountError && !parentError
        ? accountError
        : accountChecking
          ? 'Checking'
          : 'Under your wallet';

  const formReady =
    isConnected &&
    !parentError &&
    name.trim().length >= 2 &&
    symbol.trim().length >= 1 &&
    Boolean(supplySmallest) &&
    !supplyError &&
    !accountError &&
    accountAvailable;
  const waitingTemplate = templateReady === null && formReady;
  const canSubmit = formReady && !pending && templateReady === true;

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
    return () => {
      cancelled = true;
    };
  }, [open]);

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
      if (parentError) {
        setError(parentError);
        return;
      }
      if (accountError) {
        setError(accountError);
        return;
      }
      if (accountTaken) {
        setError('That name is taken — try another.');
        return;
      }
      if (!accountAvailable) {
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

      setPending(true);
      setPhase('signing');
      try {
        const txHashes = await sendCreateUserTokenTransaction(
          getSigningWallet,
          {
            contractId,
            name: tokenName,
            symbol: tokenSymbol,
            totalSupply: supplySmallest,
            icon,
            renounceOwner,
          }
        );
        setPhase('confirming');
        const confirmed = await trackTransaction({
          txHashes,
          submittedMessage: txToastConfirming.creatingToken,
          successMessage: txToastSuccess.tokenCreated,
          failureMessage: txToastError.tokenCreateFailed,
        });
        if (confirmed && accountId) {
          rememberUserCreatedToken(accountId, {
            contractId,
            name: tokenName,
            symbol: tokenSymbol,
            createdAt: Date.now(),
            renounced: renounceOwner,
            icon,
            decimals: 18,
          });
          // Sheet may have closed mid-flight — the token is still remembered,
          // but don't drive UI (phase / close) for a sheet that is gone.
          if (!openRef.current) return;
          setPhase('success');
          onCreated?.();
          requestClose();
        } else {
          setPhase('error');
        }
      } catch (cause) {
        setPhase('error');
        if (isWalletUserCancellation(cause)) {
          setPhase('idle');
          return;
        }
        const message =
          cause instanceof Error
            ? cause.message
            : txToastError.tokenCreateFailed;
        setError(message);
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
      getSigningWallet,
      icon,
      isConnected,
      name,
      onCreated,
      parentError,
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
        label="Create token"
        copy={`Your creator token · ${FT_CREATE_FUND_NEAR} NEAR`}
        closeAriaLabel="Close"
        backdropLabel="Close create token"
        zIndex={SHEET_Z.nested}
        panelClassName="account-storage-panel os-sheet-cap-tall"
        bodyClassName="account-storage-body"
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
      >
      <form
        className="app-storage-sheet token-create-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {templateReady === false ? (
          <p className="token-create-note is-warn" role="status">
            {templateDetail}
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

        <label className="guild-field" htmlFor={fieldId('supply')}>
          <span>Supply</span>
          <input
            id={fieldId('supply')}
            value={supply}
            onChange={(event) =>
              setSupply(normalizeFtSupplyInput(event.target.value))
            }
            inputMode="numeric"
            disabled={pending}
            className={osFieldBorderedClassName}
          />
          <small>{supply.trim() ? 'Minted to you' : 'Enter total supply'}</small>
        </label>

        <div className="guild-field" role="status">
          <span>Contract</span>
          <p
            className={`token-create-contract-id dao-create-mono${
              accountFieldClass ? ` ${accountFieldClass}` : ''
            }`}
          >
            {contractId ||
              (accountId
                ? `${derivedSubaccount || '…'}.${accountId}`
                : '…')}
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
            <small>Freeze name and icon forever.</small>
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

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="submit"
            ready={canSubmit}
            pending={pending || waitingTemplate}
            pendingLabel={
              waitingTemplate
                ? 'Checking…'
                : phase === 'confirming'
                  ? 'Confirming…'
                  : 'Signing…'
            }
            disabled={pending || waitingTemplate || !canSubmit}
          >
            Create
          </OsSheetAction>
        </OsSheetActions>
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
