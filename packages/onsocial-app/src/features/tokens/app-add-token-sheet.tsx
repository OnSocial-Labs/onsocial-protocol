'use client';

import {
  useCallback,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import {
  OsHugSheet,
  OsSheetAction,
  OsSheetActions,
  osFieldBorderedClassName,
} from '@onsocial/ui';
import {
  getAddTokenAccountError,
  getAddTokenOwnershipError,
  isAddTokenAccountReady,
  normalizeTokenContractId,
} from '@/lib/app-discover-tokens';
import { isFtAdminLocked } from '@/lib/app-create-token';
import {
  nearAccountPlaceholder,
  sanitizeNearAccountInput,
} from '@/lib/app-near-account';
import { viewNearContract } from '@/lib/app-near-rpc';
import { SHEET_Z } from '@/lib/sheet-z';
import { tryReadFtTokenMetadata } from '@/lib/token-metadata';
import {
  rememberUserCreatedToken,
  type UserCreatedTokenRecord,
} from '@/lib/user-created-tokens';
import {
  useNearAccountStatus,
  nearAccountStatusClass,
} from '@/hooks/use-near-account-status';

function fieldId(name: string) {
  return `token-add-${name}`;
}

export function AppAddTokenSheet({
  open,
  accountId,
  panelStyle,
  onClose,
  onAdded,
}: {
  open: boolean;
  accountId: string;
  panelStyle?: CSSProperties;
  onClose: () => void;
  onAdded?: (token: UserCreatedTokenRecord) => void;
}) {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [contractId, setContractId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetOpen = open && !closing;
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClosing(false);
      setContractId('');
      setPending(false);
      setError(null);
    }
  }

  const normalized = normalizeTokenContractId(contractId);
  const accountError = getAddTokenAccountError(contractId);
  const accountStatus = useNearAccountStatus(accountError ? '' : normalized);
  const accountTaken = accountStatus === 'found';
  const accountChecking = accountStatus === 'checking';
  const accountFieldClass = accountTaken
    ? 'is-available'
    : accountChecking
      ? 'is-checking'
      : accountError || accountStatus === 'missing'
        ? 'is-taken'
        : nearAccountStatusClass(accountStatus);
  const accountLead = accountTaken
    ? 'Found'
    : accountChecking
      ? 'Checking'
      : accountStatus === 'missing'
        ? 'Not found'
        : accountError || 'Token account';

  const canSubmit =
    isAddTokenAccountReady(contractId) &&
    accountTaken &&
    !pending &&
    !accountChecking;

  const requestClose = useCallback(() => {
    setClosing(true);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!canSubmit) return;
      setPending(true);
      setError(null);
      try {
        const [metadata, ownerRaw] = await Promise.all([
          tryReadFtTokenMetadata(normalized),
          viewNearContract<unknown>(normalized, 'get_owner', {}).catch(
            () => null
          ),
        ]);
        const ownerId =
          typeof ownerRaw === 'string' && ownerRaw.trim()
            ? ownerRaw.trim()
            : null;
        const ownershipError = getAddTokenOwnershipError({
          contractId: normalized,
          viewerId: accountId,
          ownerId,
          hasMetadata: metadata != null,
        });
        if (ownershipError) {
          setError(ownershipError);
          return;
        }
        if (!metadata) {
          setError('That is not a token.');
          return;
        }
        const record: UserCreatedTokenRecord = {
          contractId: normalized,
          name: metadata.name,
          symbol: metadata.symbol,
          createdAt: Date.now(),
          renounced: ownerId == null || isFtAdminLocked(ownerId),
          icon: metadata.icon ?? undefined,
          decimals: metadata.decimals,
        };
        rememberUserCreatedToken(accountId, record);
        onAdded?.(record);
        requestClose();
      } catch {
        setError('Could not read that token.');
      } finally {
        setPending(false);
      }
    },
    [accountId, canSubmit, normalized, onAdded, requestClose]
  );

  return (
    <OsHugSheet
      open={sheetOpen}
      onClose={requestClose}
      onClosed={handleClosed}
      label="Add"
      copy="Token you already have"
      closeAriaLabel="Close"
      backdropLabel="Close add token"
      zIndex={SHEET_Z.nested}
      panelClassName="account-storage-panel os-sheet-cap-standard"
      bodyClassName="account-storage-body"
      {...(panelStyle ? { panelStyle } : {})}
    >
      <form
        className="app-storage-sheet token-create-form"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Account</span>
          <input
            id={fieldId('id')}
            value={contractId}
            onChange={(event) =>
              setContractId(sanitizeNearAccountInput(event.target.value))
            }
            placeholder={nearAccountPlaceholder()}
            disabled={pending}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            className={`${osFieldBorderedClassName}${
              accountFieldClass ? ` ${accountFieldClass}` : ''
            }`}
          />
          <small className={accountFieldClass}>{accountLead}</small>
        </label>

        {error ? (
          <p className="token-create-note is-warn" role="alert">
            {error}
          </p>
        ) : null}

        <OsSheetActions layout="stack" tone="frosted-primary" borderless>
          <OsSheetAction
            type="submit"
            ready={canSubmit}
            pending={pending}
            pendingLabel="Checking…"
            disabled={!canSubmit}
          >
            Add
          </OsSheetAction>
        </OsSheetActions>
      </form>
    </OsHugSheet>
  );
}
