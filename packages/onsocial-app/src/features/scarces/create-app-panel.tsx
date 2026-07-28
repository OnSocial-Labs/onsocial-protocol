'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { OsSheetAction, OsSheetActions, OsSheetPrimaryAction } from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import type { CreatorAccess } from '@/features/scarces/apps-data';
import {
  creatorAccessLabel,
  creatorAccessShort,
} from '@/features/scarces/apps-data';
import { APP_APPS_PATH, appPath } from '@/lib/app-routes';
import {
  txToastConfirming,
  txToastError,
  txToastSuccess,
} from '@/lib/transaction-toast-copy';
import { isWalletUserCancellation } from '@/lib/wallet-errors';

const MAX_NAME = 60;
const MAX_DESCRIPTION = 500;
const MIN_SLUG = 3;
const MAX_SLUG = 40;
const COMMISSION_PRESETS = [0, 2.5, 5, 10] as const;
const MAX_COMMISSION_PCT = 50;
const ACCESS_MODES: CreatorAccess[] = ['open', 'approval', 'invite_only'];

function fieldId(name: string) {
  return `app-create-${name}`;
}

/** Contract slug rules: lowercase a-z0-9 and single hyphens, 3–40 chars. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG);
}

function pctToBps(pct: number): number {
  return Math.round(pct * 100);
}

export function CreateAppPanel() {
  const router = useRouter();
  const { isConnected, isLoading, connect, getSigningWallet } = useAppWallet();
  const { trackTransaction } = useAppTransactionFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [commissionInput, setCommissionInput] = useState('2.5');
  const [creatorAccess, setCreatorAccess] = useState<CreatorAccess>('open');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derivedSlug = useMemo(
    () => slugify(slugTouched ? slug || name : name),
    [slug, name, slugTouched]
  );
  const commission = Number.parseFloat(commissionInput);
  const commissionValid =
    Number.isFinite(commission) &&
    commission >= 0 &&
    commission <= MAX_COMMISSION_PCT;

  const canSubmit =
    isConnected &&
    !pending &&
    name.trim().length >= 2 &&
    derivedSlug.length >= MIN_SLUG &&
    commissionValid;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      if (!isConnected) {
        await connect();
        return;
      }
      if (derivedSlug.length < MIN_SLUG) {
        setError(`Store ID must be at least ${MIN_SLUG} characters.`);
        return;
      }
      if (!commissionValid) {
        setError(`Commission must be between 0 and ${MAX_COMMISSION_PCT}%.`);
        return;
      }

      const metadata = JSON.stringify({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      });

      setPending(true);
      try {
        const { accountId, wallet } = await getSigningWallet();
        const client = createAppScarcesWalletClient(accountId, wallet);
        const response = await client.scarces.apps.register(derivedSlug, {
          primarySaleBps: pctToBps(commission),
          creatorAccess,
          metadata,
        });
        const confirmed = await trackTransaction({
          txHashes: collectRelayTxHashes(response),
          submittedMessage: txToastConfirming.creatingApp,
          successMessage: txToastSuccess.appCreated,
          failureMessage: txToastError.createAppFailed,
        });
        if (!confirmed) return;
        router.push(appPath(derivedSlug));
      } catch (cause) {
        if (isWalletUserCancellation(cause)) return;
        setError(
          cause instanceof Error ? cause.message : txToastError.createAppFailed
        );
      } finally {
        setPending(false);
      }
    },
    [
      isConnected,
      connect,
      derivedSlug,
      commissionValid,
      commission,
      name,
      description,
      creatorAccess,
      getSigningWallet,
      trackTransaction,
      router,
    ]
  );

  return (
    <OsAppScreen
      title="Open a store"
      subtitle="Branded storefront for drops you (and allowed creators) publish."
      backFallbackHref={APP_APPS_PATH}
    >
      <form className="drop-create-form" onSubmit={handleSubmit}>
        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Store name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Midnight Records"
            maxLength={MAX_NAME}
            disabled={pending}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Store ID</span>
          <input
            id={fieldId('id')}
            value={slugTouched ? slug : derivedSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder="midnight-records"
            maxLength={MAX_SLUG}
            disabled={pending}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <small>Permanent · {appPath(derivedSlug || 'your-store')}</small>
        </label>

        <label className="guild-field" htmlFor={fieldId('description')}>
          <span>About</span>
          <textarea
            id={fieldId('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this store publishes and who it's for."
            maxLength={MAX_DESCRIPTION}
            disabled={pending}
          />
          <small>
            {description.length}/{MAX_DESCRIPTION}
          </small>
        </label>

        <label className="guild-field" htmlFor={fieldId('commission')}>
          <span>Your commission</span>
          <div
            className="app-storage-presets"
            role="group"
            aria-label="Commission presets"
          >
            {COMMISSION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`os-surface-chip${
                  commission === preset ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setCommissionInput(String(preset))}
              >
                {preset}%
              </button>
            ))}
          </div>
          <div className="drop-create-suffix-field">
            <input
              id={fieldId('commission')}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={commissionInput}
              onChange={(event) =>
                setCommissionInput(event.target.value.replace(/[^\d.]/g, ''))
              }
              placeholder="2.5"
              aria-label="Commission percentage"
              disabled={pending}
            />
            <span>% per sale</span>
          </div>
          <small>Locked on each new drop · max {MAX_COMMISSION_PCT}%.</small>
        </label>

        <div className="guild-field">
          <span>Who can create drops</span>
          <div
            className="app-storage-presets"
            role="radiogroup"
            aria-label="Who can create drops"
          >
            {ACCESS_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={creatorAccess === mode}
                className={`os-surface-chip${
                  creatorAccess === mode ? ' is-selected' : ''
                }`}
                disabled={pending}
                onClick={() => setCreatorAccess(mode)}
              >
                {creatorAccessShort(mode)}
              </button>
            ))}
          </div>
          <small>{creatorAccessLabel(creatorAccess)}</small>
        </div>

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
            pendingLabel="Opening…"
            disabled={!canSubmit}
          >
            Open store
          </OsSheetPrimaryAction>
        </OsSheetActions>
      </form>
    </OsAppScreen>
  );
}
