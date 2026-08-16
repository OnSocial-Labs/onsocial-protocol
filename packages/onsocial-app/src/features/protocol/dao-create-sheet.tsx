'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  DiscardConfirmFooter,
  OsGestureSheet,
  osFieldBorderedClassName,
  useDiscardConfirm,
} from '@onsocial/ui';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { rememberCommunityDao } from '@/features/protocol/dao-accounts';
import {
  buildDaoFactoryAccountId,
  DAO_FACTORY_NAME_MAX,
  DAO_FACTORY_PURPOSE_MAX,
  DAO_FACTORY_SLUG_MIN,
  isValidDaoFactorySlug,
  normalizeDaoFactorySlug,
  probeDaoFactoryAccountTaken,
  submitDaoFactoryCreate,
} from '@/features/protocol/dao-factory-create';
import { rememberOptimisticMyDao } from '@/features/protocol/my-daos-optimistic';
import { PROTOCOL_TASK_SHEET_Z } from '@/features/protocol/protocol-sheet-z';
import {
  CommerceSheetFooter,
  type CommerceSheetFooterState,
} from '@/features/scarces/commerce-sheet-footer';
import { useCommerceSheetKeyboard } from '@/features/scarces/commerce-sheet-keyboard';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  type EntityIdAvailability,
} from '@/hooks/use-entity-id-availability';
import {
  SPUTNIK_DAO_FACTORY,
  SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT_NEAR,
} from '@/lib/app-config';
import { daoPath } from '@/lib/app-routes';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

function fieldId(name: string) {
  return `dao-create-${name}`;
}

function daoAccountIdLead(status: EntityIdAvailability): string {
  if (status === 'idle') return 'Permanent';
  return entityIdAvailabilityLead(status);
}

function useDaoFactorySlugAvailability(
  daoAccountId: string,
  minLength: number
): EntityIdAvailability {
  const [probe, setProbe] = useState<{
    id: string;
    value: Exclude<EntityIdAvailability, 'idle'>;
  } | null>(null);
  const trimmed = daoAccountId.trim().toLowerCase();
  const slug = trimmed.includes('.')
    ? trimmed.slice(0, trimmed.indexOf('.'))
    : trimmed;
  const ready = slug.length >= minLength && isValidDaoFactorySlug(slug);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setProbe({ id: trimmed, value: 'checking' });
      void probeDaoFactoryAccountTaken(trimmed)
        .then((taken) => {
          if (!cancelled) {
            setProbe({ id: trimmed, value: taken ? 'taken' : 'available' });
          }
        })
        .catch(() => {
          // Probe failure should not block create — chain rejects collisions.
          if (!cancelled) {
            setProbe({ id: trimmed, value: 'available' });
          }
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, ready]);

  if (!ready) return 'idle';
  if (!probe || probe.id !== trimmed) return 'checking';
  return probe.value;
}

/**
 * Factory DAO create — tall gesture sheet from the DAOs directory header.
 * Creates `{slug}.{sputnik factory}` with the viewer as initial council.
 */
export function DaoCreateSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const formId = useId();
  const titleId = useId();
  const { accountId, isConnected, connect, getSigningWallet } = useAppWallet();
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const sheetOpen = open && !closing;
  const { panelStyle, keyboardOpen } = useCommerceSheetKeyboard(sheetOpen);

  const resetForm = useCallback(() => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setPurpose('');
    setPending(false);
    setError(null);
  }, []);

  const handleClosed = useCallback(() => {
    setClosing(false);
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const requestSheetClose = useCallback(() => {
    setClosing(true);
  }, []);

  const dirty =
    name.trim().length > 0 ||
    purpose.trim().length > 0 ||
    (slugTouched && slug.trim().length > 0);

  const {
    discardConfirmOpen,
    discardTitleId,
    discardBodyId,
    keepEditingRef,
    requestCloseOrConfirm,
    clearDiscardConfirm,
    keepEditing,
    discard,
  } = useDiscardConfirm({
    open: sheetOpen,
    dirty,
    pending,
    onClose: requestSheetClose,
  });

  const handleGestureClose = useCallback(() => {
    if (requestCloseOrConfirm()) {
      requestSheetClose();
    }
  }, [requestCloseOrConfirm, requestSheetClose]);

  const resolvedSlug = useMemo(
    () => normalizeDaoFactorySlug(slugTouched ? slug || name : name),
    [name, slug, slugTouched]
  );
  const daoAccountId = useMemo(
    () => buildDaoFactoryAccountId(resolvedSlug),
    [resolvedSlug]
  );
  const idAvailability = useDaoFactorySlugAvailability(
    daoAccountId,
    DAO_FACTORY_SLUG_MIN
  );
  const idAvailabilityClass = entityIdAvailabilityClass(idAvailability);

  const canSubmit =
    isValidDaoFactorySlug(resolvedSlug) &&
    name.trim().length >= 2 &&
    !pending &&
    idAvailability !== 'taken' &&
    idAvailability !== 'checking';

  const footerState = useMemo((): CommerceSheetFooterState | null => {
    if (!sheetOpen || discardConfirmOpen) return null;
    if (!isConnected) {
      return {
        visible: true,
        primaryLabel: 'Connect wallet',
        primaryPendingLabel: 'Connecting…',
        canSubmit: true,
        pending: false,
        primaryType: 'button',
        onPrimaryClick: () => {
          void connect();
        },
      };
    }
    return {
      visible: true,
      primaryLabel: 'Create DAO',
      primaryPendingLabel: 'Confirm in wallet…',
      canSubmit,
      pending,
      disabled: pending || !canSubmit,
      primaryType: 'submit',
    };
  }, [
    sheetOpen,
    discardConfirmOpen,
    isConnected,
    connect,
    canSubmit,
    pending,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!isConnected || !accountId) {
      await connect();
      return;
    }

    if (!canSubmit) {
      if (idAvailability === 'taken') {
        setError('That account id is taken — pick another.');
        return;
      }
      setError('Add a name and a valid account id.');
      return;
    }

    setPending(true);
    try {
      const { accountId: signerId, wallet } = await getSigningWallet();
      const { daoAccountId: createdId, txHashes } = await submitDaoFactoryCreate(
        {
          wallet,
          accountId: signerId,
          slug: resolvedSlug,
          displayName: name,
          purpose,
        }
      );
      const confirmed = await trackTransaction({
        txHashes,
        submittedMessage: txToastGovPending.creatingDao,
        successMessage: txToastGovSuccess.daoCreated,
        failureMessage: txToastGovError.daoCreateFailed,
      });
      if (!confirmed) return;

      rememberOptimisticMyDao({
        daoAccountId: createdId,
        roleNames: ['council'],
      });
      rememberCommunityDao(createdId);
      requestSheetClose();
      router.push(daoPath(createdId));
    } catch (cause) {
      if (isWalletUserCancellation(cause)) return;
      const message =
        cause instanceof Error && cause.message.trim()
          ? cause.message.trim()
          : txToastGovError.daoCreateFailed;
      setError(message);
      setTxResult({
        type: 'error',
        msg: txToastGovError.daoCreateFailed,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <OsGestureSheet
      open={sheetOpen}
      onClose={handleGestureClose}
      onClosed={() => {
        clearDiscardConfirm();
        handleClosed();
      }}
      verb="Create DAO"
      handle={SPUTNIK_DAO_FACTORY}
      signal="reputation"
      whisper={`You start as council · ~${SPUTNIK_DAO_FACTORY_CREATE_DEPOSIT_NEAR} NEAR`}
      closeAriaLabel="Close create DAO"
      backdropLabel="Close create DAO"
      keyboardOpen={keyboardOpen}
      panelStyle={panelStyle}
      bodyClassName="profile-support-sheet-body protocol-task-sheet-body"
      titleId={titleId}
      zIndex={PROTOCOL_TASK_SHEET_Z}
      footer={
        discardConfirmOpen ? (
          <DiscardConfirmFooter
            titleId={discardTitleId}
            bodyId={discardBodyId}
            onDiscard={discard}
            onKeepEditing={keepEditing}
            keepEditingRef={keepEditingRef}
            title="Discard DAO?"
            body="Name, account id, and purpose won’t be saved."
          />
        ) : footerState?.visible ? (
          <CommerceSheetFooter
            formId={formId}
            keyboardOpen={keyboardOpen}
            state={footerState}
          />
        ) : undefined
      }
    >
      <form
        id={formId}
        className={`protocol-task-form dao-create-form${
          discardConfirmOpen ? ' is-discard-confirm' : ''
        }`}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <p className="dao-create-lede">
          Deploys a Sputnik DAO under the network factory. Account id is
          permanent — pick carefully.
        </p>

        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSlugTouched(false);
              setError(null);
            }}
            placeholder="Builder Guild"
            maxLength={DAO_FACTORY_NAME_MAX}
            disabled={pending || discardConfirmOpen}
            className={osFieldBorderedClassName}
            autoComplete="off"
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('slug')}>
          <span>Account id</span>
          <input
            id={fieldId('slug')}
            value={slugTouched ? slug : resolvedSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
              setError(null);
            }}
            placeholder="builder-guild"
            maxLength={48}
            disabled={pending || discardConfirmOpen}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            aria-invalid={idAvailability === 'taken'}
            className={`${osFieldBorderedClassName}${
              idAvailabilityClass ? ` ${idAvailabilityClass}` : ''
            }`}
          />
          <small className={idAvailabilityClass}>
            {daoAccountIdLead(idAvailability)} ·{' '}
            <span className="dao-create-mono">
              {daoAccountId || `name.${SPUTNIK_DAO_FACTORY}`}
            </span>
          </small>
        </label>

        <label className="guild-field" htmlFor={fieldId('purpose')}>
          <span>Purpose</span>
          <textarea
            id={fieldId('purpose')}
            value={purpose}
            onChange={(event) => {
              setPurpose(event.target.value);
              setError(null);
            }}
            placeholder="Optional — what this DAO is for"
            maxLength={DAO_FACTORY_PURPOSE_MAX}
            rows={3}
            disabled={pending || discardConfirmOpen}
            className={osFieldBorderedClassName}
          />
        </label>

        {error ? (
          <p className="dao-create-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </OsGestureSheet>
  );
}
