'use client';

import { useEffect, useMemo, useState } from 'react';
import { viewContractAt } from '@/lib/near-rpc';
import {
  formatSocialSpendActionRoutingSummary,
  parseSocialSpendActionConfigView,
  socialSpendActionConfigToDraft,
  sumSocialSpendActionRoutingBps,
  type SocialSpendActionRoutingDraft,
  validateSocialSpendActionRoutingBps,
  SOCIAL_SPEND_ROUTING_BPS_DENOMINATOR,
} from '@/lib/dao-contract-config-operations';
import { cn } from '@/lib/utils';

const fieldLabelClass =
  'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80';

const ROUTING_FIELDS: Array<{
  key: keyof Pick<
    SocialSpendActionRoutingDraft,
    'treasury_bps' | 'season_pool_bps' | 'target_bps' | 'burn_bps'
  >;
  label: string;
  hint: string;
}> = [
  {
    key: 'season_pool_bps',
    label: 'Season pool',
    hint: 'Share routed to the rally season pool',
  },
  {
    key: 'treasury_bps',
    label: 'Protocol fees',
    hint: 'Share routed to boost credits when boost contract is set, else accrued for treasury sweep',
  },
  {
    key: 'target_bps',
    label: 'Target',
    hint: 'Share routed to recipient target balance',
  },
  {
    key: 'burn_bps',
    label: 'Burn',
    hint: 'Share burned from circulating SOCIAL supply',
  },
];

function parseBpsInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) {
    return null;
  }

  return parsed;
}

export function SocialSpendActionRoutingFields({
  contractId,
  actionLabel,
  draft,
  baseline,
  loading,
  loadError,
  onDraftChange,
  onReload,
  staticFieldsNote,
}: {
  contractId: string;
  actionLabel: string;
  draft: SocialSpendActionRoutingDraft | null;
  baseline: SocialSpendActionRoutingDraft | null;
  loading: boolean;
  loadError: string | null;
  onDraftChange: (draft: SocialSpendActionRoutingDraft) => void;
  onReload: () => void;
  staticFieldsNote?: string;
}) {
  const routingValid = draft
    ? validateSocialSpendActionRoutingBps(draft)
    : false;
  const routingSum = draft ? sumSocialSpendActionRoutingBps(draft) : 0;
  const disclosure = draft
    ? formatSocialSpendActionRoutingSummary(draft, {
        protocolFeesRouteToBoost: true,
      })
    : null;

  if (loading) {
    return (
      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
        Loading {actionLabel} routing from chain…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
          {loadError}
        </div>
        <button
          type="button"
          onClick={onReload}
          className="text-sm font-medium text-[var(--portal-blue)] underline-offset-2 hover:underline"
        >
          Retry loading config
        </button>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
        Select a contract and setting to load routing.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!baseline ? (
        <div className="rounded-2xl border border-[var(--portal-blue)]/25 bg-[var(--portal-blue)]/5 px-4 py-3 text-sm text-foreground">
          <p className="font-medium">Register new action</p>
          <p className="mt-1 text-muted-foreground">
            {actionLabel} is not configured on {contractId} yet. Proposing will
            call <code className="text-xs">set_action_config</code> with the
            defaults below.
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {ROUTING_FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label
              htmlFor={`social-spend-routing-${key}`}
              className={fieldLabelClass}
            >
              {label} (bps)
            </label>
            <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-3 py-2.5 md:px-4">
              <input
                id={`social-spend-routing-${key}`}
                type="text"
                inputMode="numeric"
                value={String(draft[key])}
                onChange={(event) => {
                  const nextValue = parseBpsInput(event.target.value);
                  if (nextValue == null && event.target.value.trim() !== '') {
                    return;
                  }
                  onDraftChange({
                    ...draft,
                    [key]: nextValue ?? 0,
                  });
                }}
                className="w-full bg-transparent text-sm font-medium outline-none"
              />
            </div>
            <p className="mt-1.5 portal-type-caption text-muted-foreground/70">
              {hint} ·{' '}
              {(draft[key] / 100).toFixed(draft[key] % 100 === 0 ? 0 : 1)}%
            </p>
          </div>
        ))}
      </div>

      <div
        className={cn(
          'rounded-2xl border px-4 py-3 text-sm',
          routingValid
            ? 'border-border/40 bg-background/45 text-muted-foreground'
            : 'border-amber-500/30 bg-amber-500/5 text-amber-700'
        )}
      >
        <p>
          Total: {routingSum.toLocaleString()} /{' '}
          {SOCIAL_SPEND_ROUTING_BPS_DENOMINATOR.toLocaleString()} bps
          {!routingValid ? ' — shares must sum to 100%.' : null}
        </p>
        {disclosure ? (
          <p className="mt-1 font-medium text-foreground">{disclosure}</p>
        ) : null}
        {baseline &&
        draft.treasury_bps === baseline.treasury_bps &&
        draft.season_pool_bps === baseline.season_pool_bps &&
        draft.target_bps === baseline.target_bps &&
        draft.burn_bps === baseline.burn_bps ? (
          <p className="mt-1 portal-type-caption text-muted-foreground/70">
            Matches current on-chain routing.
          </p>
        ) : null}
      </div>

      {staticFieldsNote ? (
        <p className="portal-type-caption text-muted-foreground/70">
          {staticFieldsNote}
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Use SocialSpendActionRoutingFields */
export const SocialSpendJoinRallyRoutingFields = SocialSpendActionRoutingFields;

export function useSocialSpendActionRoutingDraft(
  contractId: string,
  options: {
    actionId: string;
    actionLabel: string;
    defaultDraft?: SocialSpendActionRoutingDraft | null;
  } | null
): {
  draft: SocialSpendActionRoutingDraft | null;
  baseline: SocialSpendActionRoutingDraft | null;
  loading: boolean;
  loadError: string | null;
  setDraft: (draft: SocialSpendActionRoutingDraft) => void;
  reload: () => void;
} {
  const normalizedContractId = contractId.trim().toLowerCase();
  const actionId = options?.actionId ?? '';
  const actionLabel = options?.actionLabel ?? actionId;
  const defaultDraft = options?.defaultDraft ?? null;
  const [draft, setDraftState] = useState<SocialSpendActionRoutingDraft | null>(
    null
  );
  const [baseline, setBaseline] =
    useState<SocialSpendActionRoutingDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!normalizedContractId || !actionId) {
      setDraftState(null);
      setBaseline(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void viewContractAt<unknown>(normalizedContractId, 'get_action_config', {
      action_id: actionId,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        const parsed = parseSocialSpendActionConfigView(result);
        if (!parsed) {
          if (defaultDraft) {
            setDraftState({ ...defaultDraft });
            setBaseline(null);
            return;
          }

          setDraftState(null);
          setBaseline(null);
          setLoadError(`Could not read ${actionLabel} routing from chain.`);
          return;
        }

        const nextDraft = socialSpendActionConfigToDraft(parsed);
        setDraftState(nextDraft);
        setBaseline(nextDraft);
      })
      .catch(() => {
        if (!cancelled) {
          if (defaultDraft) {
            setDraftState({ ...defaultDraft });
            setBaseline(null);
            setLoadError(null);
            return;
          }

          setDraftState(null);
          setBaseline(null);
          setLoadError(`Could not read ${actionLabel} routing from chain.`);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [actionId, actionLabel, defaultDraft, normalizedContractId, reloadToken]);

  const reload = useMemo(
    () => () => {
      setReloadToken((current) => current + 1);
    },
    []
  );

  return {
    draft,
    baseline,
    loading,
    loadError,
    setDraft: setDraftState,
    reload,
  };
}

/** @deprecated Use useSocialSpendActionRoutingDraft */
export function useSocialSpendJoinRallyRoutingDraft(contractId: string) {
  return useSocialSpendActionRoutingDraft(contractId, {
    actionId: 'join_rally',
    actionLabel: 'join rally',
  });
}
