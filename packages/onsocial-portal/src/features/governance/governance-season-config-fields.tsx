'use client';

import { useEffect, useMemo, useState } from 'react';
import { viewContractAt } from '@/lib/near-rpc';
import {
  createDefaultSeasonConfigDraft,
  formatSeasonConfigSummary,
  parseSocialSpendSeasonConfigView,
  seasonConfigDraftChanged,
  socialSpendSeasonConfigToDraft,
  validateSeasonConfigDraft,
  type SocialSpendSeasonConfigDraft,
} from '@/lib/dao-contract-config-operations';

const fieldLabelClass =
  'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80';

const inputClass =
  'portal-field-focus w-full rounded-xl border border-border/40 bg-background/45 px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-[var(--portal-blue-border)]';

export function SocialSpendSeasonConfigFields({
  contractId,
  draft,
  baseline,
  loading,
  loadError,
  onDraftChange,
  onReload,
}: {
  contractId: string;
  draft: SocialSpendSeasonConfigDraft | null;
  baseline: SocialSpendSeasonConfigDraft | null;
  loading: boolean;
  loadError: string | null;
  onDraftChange: (draft: SocialSpendSeasonConfigDraft) => void;
  onReload: () => void;
}) {
  const validationError = draft ? validateSeasonConfigDraft(draft) : null;
  const summary = draft ? formatSeasonConfigSummary(draft) : null;

  if (loading) {
    return (
      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
        Loading season config from chain…
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
        Select a contract and setting to configure the season window.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full border border-border/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-[var(--portal-blue-border)] hover:text-foreground"
          onClick={() => onDraftChange(createDefaultSeasonConfigDraft())}
        >
          7h test preset
        </button>
      </div>

      <div>
        <label className={fieldLabelClass} htmlFor="season-config-id">
          Season id
        </label>
        <input
          id="season-config-id"
          className={inputClass}
          value={draft.season_id}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              season_id: event.target.value.trim().toLowerCase(),
            })
          }
          placeholder="season-two"
          autoComplete="off"
        />
      </div>

      <div>
        <label className={fieldLabelClass} htmlFor="season-config-label">
          Label
        </label>
        <input
          id="season-config-label"
          className={inputClass}
          value={draft.label}
          onChange={(event) =>
            onDraftChange({ ...draft, label: event.target.value })
          }
          placeholder="OnSocial Rally"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={fieldLabelClass} htmlFor="season-config-starts">
            Starts
          </label>
          <input
            id="season-config-starts"
            type="datetime-local"
            className={inputClass}
            value={draft.starts_at_local}
            onChange={(event) =>
              onDraftChange({ ...draft, starts_at_local: event.target.value })
            }
          />
        </div>
        <div>
          <label className={fieldLabelClass} htmlFor="season-config-ends">
            Ends
          </label>
          <input
            id="season-config-ends"
            type="datetime-local"
            className={inputClass}
            value={draft.ends_at_local}
            onChange={(event) =>
              onDraftChange({ ...draft, ends_at_local: event.target.value })
            }
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={draft.use_custom_claim_start}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              use_custom_claim_start: event.target.checked,
              claim_starts_at_local: event.target.checked
                ? draft.claim_starts_at_local || draft.ends_at_local
                : draft.ends_at_local,
            })
          }
        />
        Custom claim open time (defaults to season end)
      </label>

      {draft.use_custom_claim_start ? (
        <div>
          <label className={fieldLabelClass} htmlFor="season-config-claim">
            Claim opens
          </label>
          <input
            id="season-config-claim"
            type="datetime-local"
            className={inputClass}
            value={draft.claim_starts_at_local}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                claim_starts_at_local: event.target.value,
              })
            }
          />
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={draft.active}
          onChange={(event) =>
            onDraftChange({ ...draft, active: event.target.checked })
          }
        />
        Season active (accepts rally spends)
      </label>

      {summary ? (
        <p className="portal-type-caption text-muted-foreground/80">
          {summary}
        </p>
      ) : null}

      {validationError ? (
        <p className="portal-type-caption text-amber-700">{validationError}</p>
      ) : null}

      {baseline &&
      draft &&
      seasonConfigDraftChanged(baseline, draft) &&
      !validationError ? (
        <p className="portal-type-caption text-muted-foreground/70">
          Updates on-chain season window for {draft.season_id.trim()}.
        </p>
      ) : baseline && draft && !seasonConfigDraftChanged(baseline, draft) ? (
        <p className="portal-type-caption text-muted-foreground/70">
          Matches current on-chain season config.
        </p>
      ) : null}
    </div>
  );
}

export function useSocialSpendSeasonConfigDraft(
  contractId: string,
  initialSeasonId = 'season-two'
): {
  draft: SocialSpendSeasonConfigDraft | null;
  baseline: SocialSpendSeasonConfigDraft | null;
  loading: boolean;
  loadError: string | null;
  setDraft: (draft: SocialSpendSeasonConfigDraft) => void;
  reload: () => void;
} {
  const normalizedContractId = contractId.trim().toLowerCase();
  const [seasonIdInput, setSeasonIdInput] = useState(initialSeasonId);
  const [draft, setDraftState] = useState<SocialSpendSeasonConfigDraft | null>(
    null
  );
  const [baseline, setBaseline] = useState<SocialSpendSeasonConfigDraft | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const setDraft = useMemo(
    () => (nextDraft: SocialSpendSeasonConfigDraft) => {
      setSeasonIdInput(nextDraft.season_id.trim().toLowerCase());
      setDraftState(nextDraft);
    },
    []
  );

  useEffect(() => {
    if (!normalizedContractId) {
      setDraftState(null);
      setBaseline(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void viewContractAt<unknown>(normalizedContractId, 'get_season_config', {
      season_id: seasonIdInput,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        const parsed = parseSocialSpendSeasonConfigView(result);
        if (!parsed) {
          const fresh = createDefaultSeasonConfigDraft(seasonIdInput);
          setDraftState(fresh);
          setBaseline(null);
          return;
        }

        const nextDraft = socialSpendSeasonConfigToDraft(seasonIdInput, parsed);
        setDraftState(nextDraft);
        setBaseline(nextDraft);
      })
      .catch(() => {
        if (!cancelled) {
          const fresh = createDefaultSeasonConfigDraft(seasonIdInput);
          setDraftState(fresh);
          setBaseline(null);
          setLoadError(null);
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
  }, [normalizedContractId, reloadToken, seasonIdInput]);

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
    setDraft,
    reload,
  };
}
