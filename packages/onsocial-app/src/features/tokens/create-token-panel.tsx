'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  OsSheetAction,
  OsSheetActions,
  OsSheetPrimaryAction,
  QuestionMarkCircleFillIcon,
  osIconActionClassName,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { InfoDrawer } from '@/components/ui/info-drawer';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  useNearAccountAvailability,
} from '@/hooks/use-near-account-availability';
import {
  buildFtContractAccountId,
  defaultFtIconDataUrl,
  FT_NAME_MAX,
  FT_SUBACCOUNT_MAX,
  FT_SYMBOL_MAX,
  getFtContractAccountError,
  getFtParentAccountError,
  normalizeFtSubaccountLabel,
  parseFtSupplySmallest,
} from '@/lib/app-create-token';
import { sendCreateUserTokenTransaction } from '@/lib/app-create-token-transactions';
import { FT_CREATE_FUND_NEAR } from '@/lib/app-ft-template-config';
import { nearAccountSuffixHint } from '@/lib/app-near-account';
import { APP_APPS_PATH, APP_TOKENS_CREATE_PATH } from '@/lib/app-routes';
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

const HELP_TITLE = 'Your token';
const HELP_SUMMARY =
  'Deploy a fungible token under your account — one batched wallet signature.';
const HELP_DETAIL =
  'Pick any subaccount name (cool.you.near or cool.you.tg). We attach the published OnSocial token template via global contract hash (light tx), mint supply to you, and leave the account without full-access keys so the code stays locked. Optional: renounce admin so icon/owner can never change. Requires a named wallet (.near, .tg, or .testnet).';

export function CreateTokenPanel() {
  const { isConnected, isLoading, connect, getSigningWallet, accountId } =
    useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('1000000');
  const [subaccount, setSubaccount] = useState('');
  const [subaccountTouched, setSubaccountTouched] = useState(false);
  const [renounceOwner, setRenounceOwner] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [templateReady, setTemplateReady] = useState<boolean | null>(null);
  const [templateDetail, setTemplateDetail] = useState<string | null>(null);

  const derivedSubaccount = useMemo(() => {
    if (subaccountTouched) {
      return normalizeFtSubaccountLabel(subaccount);
    }
    return normalizeFtSubaccountLabel(symbol || name);
  }, [subaccount, symbol, name, subaccountTouched]);

  const contractId = useMemo(
    () =>
      accountId
        ? buildFtContractAccountId(accountId, derivedSubaccount)
        : '',
    [accountId, derivedSubaccount]
  );

  const parentError = getFtParentAccountError(accountId);
  const accountError = accountId
    ? getFtContractAccountError(accountId, derivedSubaccount)
    : '';
  const availability = useNearAccountAvailability(
    parentError || accountError ? '' : contractId
  );
  const availabilityClass = entityIdAvailabilityClass(availability);
  const supplySmallest = parseFtSupplySmallest(supply);

  const canSubmit =
    isConnected &&
    !pending &&
    templateReady === true &&
    !parentError &&
    name.trim().length >= 2 &&
    symbol.trim().length >= 1 &&
    Boolean(supplySmallest) &&
    !accountError &&
    availability !== 'taken' &&
    availability !== 'checking';

  useEffect(() => {
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
  }, []);

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
      if (availability === 'taken') {
        setError('That account already exists — pick another name.');
        return;
      }
      if (!supplySmallest) {
        setError('Enter a total supply greater than zero.');
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

      setPending(true);
      try {
        const txHashes = await sendCreateUserTokenTransaction(
          getSigningWallet,
          {
            contractId,
            name: tokenName,
            symbol: tokenSymbol,
            totalSupply: supplySmallest,
            icon: defaultFtIconDataUrl(tokenSymbol),
            renounceOwner,
          }
        );
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
          });
        }
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        const message =
          cause instanceof Error && cause.message
            ? cause.message
            : txToastError.tokenCreateFailed;
        setTxResult({ type: 'error', msg: message });
      } finally {
        setPending(false);
      }
    },
    [
      accountError,
      parentError,
      accountId,
      availability,
      connect,
      contractId,
      getSigningWallet,
      isConnected,
      name,
      renounceOwner,
      setTxResult,
      supplySmallest,
      symbol,
      templateDetail,
      templateReady,
      trackTransaction,
    ]
  );

  return (
    <OsAppScreen
      title="Create token"
      backFallbackHref={APP_APPS_PATH}
      glassChrome
      actions={
        <button
          type="button"
          className={osIconActionClassName}
          aria-label={HELP_TITLE}
          aria-expanded={helpOpen}
          aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}
        >
          <QuestionMarkCircleFillIcon
            aria-hidden
            className="glass-sheet-close-icon"
          />
        </button>
      }
    >
      <form className="drop-create-form" onSubmit={handleSubmit}>
        {templateReady === false ? (
          <p className="guild-form-error" role="status">
            {templateDetail ?? 'Token template is not ready on this network.'}
          </p>
        ) : null}

        {parentError && isConnected ? (
          <p className="guild-form-error" role="status">
            {parentError} Named wallets use {nearAccountSuffixHint()}.
          </p>
        ) : null}

        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!subaccountTouched) setSubaccount('');
            }}
            placeholder="Cool Coin"
            maxLength={FT_NAME_MAX}
            disabled={pending}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('symbol')}>
          <span>Symbol</span>
          <input
            id={fieldId('symbol')}
            value={symbol}
            onChange={(event) => {
              setSymbol(event.target.value.toUpperCase());
              if (!subaccountTouched) setSubaccount('');
            }}
            placeholder="COOL"
            maxLength={FT_SYMBOL_MAX}
            disabled={pending}
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('supply')}>
          <span>Total supply</span>
          <input
            id={fieldId('supply')}
            type="text"
            inputMode="decimal"
            value={supply}
            onChange={(event) =>
              setSupply(event.target.value.replace(/[^\d.]/g, ''))
            }
            placeholder="1000000"
            disabled={pending}
            autoComplete="off"
          />
          <small>Minted to your wallet · 18 decimals.</small>
        </label>

        <label className="guild-field" htmlFor={fieldId('subaccount')}>
          <span>Account</span>
          <input
            id={fieldId('subaccount')}
            value={subaccountTouched ? subaccount : derivedSubaccount}
            onChange={(event) => {
              setSubaccountTouched(true);
              setSubaccount(event.target.value);
            }}
            placeholder="cool"
            maxLength={FT_SUBACCOUNT_MAX}
            disabled={pending || !accountId}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            aria-invalid={availability === 'taken' || Boolean(accountError)}
            className={availabilityClass}
          />
          <small className={availabilityClass}>
            {accountError
              ? accountError
              : `${entityIdAvailabilityLead(availability)} · ${
                  contractId || APP_TOKENS_CREATE_PATH
                }`}
          </small>
        </label>

        <label className="guild-field guild-field-check" htmlFor={fieldId('lock')}>
          <input
            id={fieldId('lock')}
            type="checkbox"
            checked={renounceOwner}
            onChange={(event) => setRenounceOwner(event.target.checked)}
            disabled={pending}
          />
          <span>
            Lock admin
            <small>
              Renounce owner controls (icon / transfer). Code is already locked
              without full-access keys.
            </small>
          </span>
        </label>

        <p className="guild-field-hint">
          Funds ~{FT_CREATE_FUND_NEAR} NEAR for the new account. Uses the global
          token template — no WASM in the transaction.
        </p>

        {error ? <p className="guild-form-error">{error}</p> : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          {!isConnected && !isLoading ? (
            <OsSheetAction
              type="button"
              variant="ghost"
              onClick={() => void connect()}
            >
              Connect wallet
            </OsSheetAction>
          ) : null}
          <OsSheetPrimaryAction
            type="submit"
            ready={canSubmit}
            pending={pending}
            pendingLabel="Creating…"
            disabled={!canSubmit}
          >
            Create token
          </OsSheetPrimaryAction>
        </OsSheetActions>
      </form>

      <InfoDrawer
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={HELP_TITLE}
        summary={HELP_SUMMARY}
        detail={HELP_DETAIL}
      />
    </OsAppScreen>
  );
}
