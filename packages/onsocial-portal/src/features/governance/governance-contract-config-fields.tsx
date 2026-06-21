'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { viewContractAt, yoctoToSocial } from '@/lib/near-rpc';
import {
  getSocialSpendRoutingFieldLayout,
  parseSocialSpendActionConfigView,
  parseSocialSpendMinAmountInputToYocto,
  sanitizeSocialSpendRoutingMinAmountInput,
  socialSpendActionConfigToDraft,
  SOCIAL_SPEND_ROUTING_SHARE_FIELD_LABELS,
  type DaoContractConfigOperationId,
  type SocialSpendActionRoutingDraft,
  type SocialSpendRoutingShareFieldKey,
  validateSocialSpendRoutingMinAmountYocto,
} from '@/lib/dao-contract-config-operations';
import {
  governanceCreateFieldLabelClass,
  governanceCreateFieldShellClass,
} from '@/features/governance/governance-create-compact-ui';
import { cn } from '@/lib/utils';

const fieldLabelClass = governanceCreateFieldLabelClass;

const fieldShellClass = cn(
  governanceCreateFieldShellClass,
  'px-2.5 py-2.5 sm:px-3 md:px-4'
);

function formatBpsAsPercentInput(bps: number): string {
  const percent = bps / 100;
  return percent % 1 === 0 ? String(percent) : percent.toFixed(1);
}

function parsePercentInputToBps(value: string): number | null {
  const trimmed = value.trim().replace(/%$/, '');
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return Math.round(parsed * 100);
}

function updateRoutingShareDraft(
  draft: SocialSpendActionRoutingDraft,
  fieldKey: SocialSpendRoutingShareFieldKey,
  rawValue: string,
  onDraftChange: (draft: SocialSpendActionRoutingDraft) => void
) {
  const nextValue = parsePercentInputToBps(rawValue);
  if (nextValue == null && rawValue.trim() !== '') {
    return;
  }

  onDraftChange({
    ...draft,
    [fieldKey]: nextValue ?? 0,
  });
}

function RoutingShareInput({
  fieldKey,
  draft,
  onDraftChange,
  inline = false,
}: {
  fieldKey: SocialSpendRoutingShareFieldKey;
  draft: SocialSpendActionRoutingDraft;
  onDraftChange: (draft: SocialSpendActionRoutingDraft) => void;
  inline?: boolean;
}) {
  const label = SOCIAL_SPEND_ROUTING_SHARE_FIELD_LABELS[fieldKey];
  const inputId = `social-spend-routing-${fieldKey}`;

  if (inline) {
    return (
      <div className={cn(fieldShellClass, 'flex min-w-0 items-center gap-2')}>
        <label
          htmlFor={inputId}
          className="shrink-0 text-[0.6875rem] font-medium text-muted-foreground/80"
        >
          {label}
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={formatBpsAsPercentInput(draft[fieldKey])}
          onChange={(event) => {
            updateRoutingShareDraft(
              draft,
              fieldKey,
              event.target.value,
              onDraftChange
            );
          }}
          className="min-w-0 flex-1 bg-transparent text-right text-sm font-medium outline-none"
        />
        <span className="shrink-0 text-sm text-muted-foreground/60">%</span>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className={fieldLabelClass}>
        {label}
      </label>
      <div className={cn(fieldShellClass, 'flex items-center gap-1')}>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={formatBpsAsPercentInput(draft[fieldKey])}
          onChange={(event) => {
            updateRoutingShareDraft(
              draft,
              fieldKey,
              event.target.value,
              onDraftChange
            );
          }}
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
        />
        <span className="shrink-0 text-sm text-muted-foreground/60">%</span>
      </div>
    </div>
  );
}

export function SocialSpendActionRoutingFields({
  operationId,
  actionLabel,
  draft,
  baseline,
  loading,
  loadError,
  onDraftChange,
  onReload,
  minAmountPolicy = null,
  editableActive = false,
}: {
  operationId: DaoContractConfigOperationId;
  actionLabel: string;
  draft: SocialSpendActionRoutingDraft | null;
  baseline: SocialSpendActionRoutingDraft | null;
  loading: boolean;
  loadError: string | null;
  onDraftChange: (draft: SocialSpendActionRoutingDraft) => void;
  onReload: () => void;
  minAmountPolicy?: Extract<
    DaoContractConfigOperationId,
    | 'social_spend_join_rally_routing'
    | 'social_spend_support_profile_routing'
    | 'social_spend_support_endorsement_routing'
    | 'social_spend_boost_post_routing'
  > | null;
  editableActive?: boolean;
}) {
  const [minAmountInput, setMinAmountInput] = useState('');
  const prevLoadingRef = useRef(true);
  const editableMinAmount = minAmountPolicy != null;
  const fieldLayout = getSocialSpendRoutingFieldLayout(operationId);
  const shareFieldKeys = [
    ...fieldLayout.primary,
    ...fieldLayout.secondary,
  ] as const;

  useEffect(() => {
    const finishedLoading = prevLoadingRef.current && !loading;
    prevLoadingRef.current = loading;

    if (!editableMinAmount || !minAmountPolicy || !finishedLoading || !draft) {
      return;
    }

    setMinAmountInput(
      validateSocialSpendRoutingMinAmountYocto(
        draft.min_amount,
        minAmountPolicy
      )
        ? yoctoToSocial(draft.min_amount)
        : ''
    );
  }, [editableMinAmount, loading, draft, minAmountPolicy]);

  if (loading) {
    return (
      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
        Loading {actionLabel}…
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
          Retry
        </button>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
        Select contract and setting.
      </div>
    );
  }

  const useInlinePrimaryShares =
    fieldLayout.primary.length === 2 && fieldLayout.secondary.length === 0;

  return (
    <div className="space-y-3">
      {editableMinAmount && minAmountPolicy ? (
        <div
          className={cn(
            'grid gap-3',
            editableActive
              ? 'grid-cols-1 min-[420px]:grid-cols-[minmax(0,1fr)_auto]'
              : 'grid-cols-1'
          )}
        >
          <div>
            <label
              htmlFor="social-spend-routing-min-amount"
              className={fieldLabelClass}
            >
              Min
            </label>
            <div className={cn(fieldShellClass, 'flex items-center gap-1')}>
              <input
                id="social-spend-routing-min-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={minAmountInput}
                onChange={(event) => {
                  const nextInput = sanitizeSocialSpendRoutingMinAmountInput(
                    event.target.value,
                    minAmountInput,
                    minAmountPolicy
                  );
                  setMinAmountInput(nextInput);

                  const parsedYocto =
                    parseSocialSpendMinAmountInputToYocto(nextInput);
                  if (
                    parsedYocto &&
                    validateSocialSpendRoutingMinAmountYocto(
                      parsedYocto,
                      minAmountPolicy
                    )
                  ) {
                    onDraftChange({
                      ...draft,
                      min_amount: parsedYocto,
                    });
                    return;
                  }

                  onDraftChange({ ...draft, min_amount: '0' });
                }}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
              />
              <span className="shrink-0 text-sm text-muted-foreground/60">
                SOCIAL
              </span>
            </div>
          </div>

          {editableActive ? (
            <div className="flex items-end pb-0.5">
              <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-border/40 bg-background/45 px-4 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => {
                    onDraftChange({
                      ...draft,
                      active: event.target.checked,
                    });
                  }}
                  className="h-4 w-4 rounded border-border/60"
                />
                <span className="font-medium text-foreground">Active</span>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          'grid gap-2 sm:gap-3',
          shareFieldKeys.length > 2
            ? 'grid-cols-2 sm:grid-cols-4'
            : 'grid-cols-2'
        )}
      >
        {shareFieldKeys.map((fieldKey) => (
          <RoutingShareInput
            key={fieldKey}
            fieldKey={fieldKey}
            draft={draft}
            onDraftChange={onDraftChange}
            inline={useInlinePrimaryShares}
          />
        ))}
      </div>
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
