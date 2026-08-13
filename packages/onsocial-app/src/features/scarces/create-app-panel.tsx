'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  OsSheetAction,
  OsSheetActions,
  OsIconAction,
  QuestionMarkCircleFillIcon,
} from '@onsocial/ui';
import { OsAppScreen } from '@/components/app/os-app-screen';
import { SuffixField } from '@/components/ui/suffix-field';
import { useAppTransactionFeedback } from '@/contexts/app-transaction-feedback-context';
import { useAppWallet } from '@/contexts/app-wallet-context';
import {
  entityIdAvailabilityClass,
  entityIdAvailabilityLead,
  useEntityIdAvailability,
} from '@/hooks/use-entity-id-availability';
import { collectRelayTxHashes } from '@/features/guilds/guilds-data';
import { createAppScarcesWalletClient } from '@/features/scarces/scarces-wallet-client';
import type { CreatorAccess } from '@/features/scarces/apps-data';
import {
  creatorAccessLabel,
  creatorAccessShort,
} from '@/features/scarces/apps-data';
import { hubCategoriesMetadataFields } from '@/features/scarces/hub-categories';
import {
  HubCreateHelpDrawer,
  HUB_CREATE_HELP_TITLE,
} from '@/features/scarces/hub-create-help-drawer';
import { HubCategoriesEditor } from '@/features/scarces/hub-categories-editor';
import { APP_APPS_PATH, appPath } from '@/lib/app-routes';
import { normalizeTopicList } from '@/lib/topic-slug';

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
  const { trackTransaction, setTxResult } = useAppTransactionFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [commissionInput, setCommissionInput] = useState('2.5');
  const [creatorAccess, setCreatorAccess] = useState<CreatorAccess>('open');
  const [categories, setCategories] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const derivedSlug = useMemo(
    () => slugify(slugTouched ? slug || name : name),
    [slug, name, slugTouched]
  );
  const idAvailability = useEntityIdAvailability('hub', derivedSlug, MIN_SLUG);
  const idAvailabilityClass = entityIdAvailabilityClass(idAvailability);
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
    commissionValid &&
    normalizeTopicList(categories).length >= 1 &&
    idAvailability !== 'taken' &&
    idAvailability !== 'checking';

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      if (!isConnected) {
        await connect();
        return;
      }
      if (derivedSlug.length < MIN_SLUG) {
        setError(`Hub ID must be at least ${MIN_SLUG} characters.`);
        return;
      }
      if (!commissionValid) {
        setError(`Commission must be between 0 and ${MAX_COMMISSION_PCT}%.`);
        return;
      }
      const normalizedCategories = normalizeTopicList(categories);
      if (normalizedCategories.length < 1) {
        setError('Pick or type a category for this hub.');
        return;
      }

      const metadata = JSON.stringify({
        name: name.trim(),
        ...hubCategoriesMetadataFields(normalizedCategories),
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
        const detail =
          cause instanceof Error && cause.message.trim()
            ? cause.message.trim()
            : null;
        setTxResult({
          type: 'error',
          msg:
            detail &&
            !detail.startsWith('{') &&
            detail.length < 160
              ? detail
              : txToastError.createAppFailed,
        });
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
      categories,
      getSigningWallet,
      trackTransaction,
      setTxResult,
      router,
    ]
  );

  return (
    <OsAppScreen
      title="Open a hub"
      backFallbackHref={APP_APPS_PATH}
      glassChrome
      actions={
        <OsIconAction
          ariaLabel={HUB_CREATE_HELP_TITLE}
          aria-expanded={helpOpen}
          aria-haspopup="dialog"
          onClick={() => setHelpOpen(true)}
        >
          <QuestionMarkCircleFillIcon
            aria-hidden
            className="glass-sheet-close-icon"
          />
        </OsIconAction>
      }
    >
      <form className="drop-create-form" onSubmit={handleSubmit}>
        <label className="guild-field" htmlFor={fieldId('name')}>
          <span>Name</span>
          <input
            id={fieldId('name')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              // Name is source of truth — re-link ID after any name edit.
              setSlugTouched(false);
            }}
            placeholder="Midnight Records"
            maxLength={MAX_NAME}
            disabled={pending}
          />
        </label>

        <label className="guild-field" htmlFor={fieldId('id')}>
          <span>Hub ID</span>
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
            aria-invalid={idAvailability === 'taken'}
            className={idAvailabilityClass}
          />
          <small className={idAvailabilityClass}>
            {entityIdAvailabilityLead(idAvailability)} ·{' '}
            {appPath(derivedSlug || 'your-hub')}
          </small>
        </label>

        <label className="guild-field" htmlFor={fieldId('description')}>
          <span>About</span>
          <textarea
            id={fieldId('description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What this hub publishes and who it's for."
            maxLength={MAX_DESCRIPTION}
            disabled={pending}
            aria-describedby={fieldId('description-count')}
          />
          <small id={fieldId('description-count')}>
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
          <SuffixField
            id={fieldId('commission')}
            value={commissionInput}
            inputMode="decimal"
            onValueChange={(value) =>
              setCommissionInput(value.replace(/[^\d.]/g, ''))
            }
            placeholder="2.5"
            aria-label="Commission percentage"
            suffix="% per sale"
            disabled={pending}
          />
          <small>Locked on each new drop · max {MAX_COMMISSION_PCT}%.</small>
        </label>

        <div className="guild-field">
          <span>Category</span>
          <HubCategoriesEditor
            categories={categories}
            onChange={setCategories}
            id={fieldId('categories')}
            disabled={pending}
          />
        </div>

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
          <OsSheetAction
            type="submit"
            ready={canSubmit}
            pending={pending}
            pendingLabel="Opening…"
            disabled={!canSubmit}
          >
            Open hub
          </OsSheetAction>
        </OsSheetActions>
      </form>
      <HubCreateHelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </OsAppScreen>
  );
}
