'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { PortalFieldSelect } from '@/components/ui/portal-field-select';
import { PulsingDots } from '@/components/ui/pulsing-dots';
import { RelativeDurationFields } from '@/components/ui/relative-duration-fields';
import {
  governanceCreateFieldLabelClass,
  governanceCreateFieldShellClass,
} from '@/features/governance/governance-create-compact-ui';
import { viewContractAt } from '@/lib/near-rpc';
import {
  applySeasonStartOffsetMinutes,
  createDefaultSeasonConfigDraft,
  parseSeasonIdsFromChainView,
  parseSocialSpendSeasonConfigView,
  socialSpendSeasonConfigToDraft,
  validateSeasonIdDraft,
  validateSeasonLabelDraft,
  type SocialSpendSeasonConfigDraft,
} from '@/lib/dao-contract-config-operations';
import { startsAtLocalFromOffsetMinutes } from '@/lib/relative-duration';
import { cn } from '@/lib/utils';

const feedbackExit = { opacity: 0, transition: { duration: 0 } };
const feedbackEnter = { opacity: 0, y: -4 };
const feedbackAnimate = { opacity: 1, y: 0 };
const feedbackTransition = { duration: 0.16, ease: 'easeOut' as const };

const fieldLabelClass = governanceCreateFieldLabelClass;

const fieldShellClass = governanceCreateFieldShellClass;

const inputClass =
  'min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/50 md:py-3.5';

const SEASON_ID_LOOKUP_DEBOUNCE_MS = 600;
const NEW_SEASON_VALUE = '__new__';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function normalizeLoadedDraft(
  draft: SocialSpendSeasonConfigDraft
): SocialSpendSeasonConfigDraft {
  const startsMs = Date.parse(draft.starts_at_local);
  if (Number.isFinite(startsMs) && startsMs <= Date.now()) {
    const start_offset_minutes = 10_080;
    return {
      ...draft,
      start_offset_minutes,
      starts_at_local: startsAtLocalFromOffsetMinutes(start_offset_minutes),
    };
  }
  return draft;
}

function isExistingSeasonSelection(
  seasonId: string,
  chainSeasonIds: readonly string[]
): boolean {
  const normalized = seasonId.trim().toLowerCase();
  return normalized.length > 0 && chainSeasonIds.includes(normalized);
}

export function SocialSpendSeasonConfigFields({
  draft,
  baseline,
  chainSeasonIds,
  loading,
  refreshing,
  loadError,
  onDraftChange,
  onReload,
  onSelectExistingSeason,
  lookupReady,
  hasOnChainConfig,
}: {
  contractId: string;
  draft: SocialSpendSeasonConfigDraft | null;
  baseline: SocialSpendSeasonConfigDraft | null;
  chainSeasonIds: readonly string[];
  loading: boolean;
  refreshing?: boolean;
  loadError: string | null;
  onDraftChange: (draft: SocialSpendSeasonConfigDraft) => void;
  onReload: () => void;
  onSelectExistingSeason: (seasonId: string) => void;
  lookupReady: boolean;
  hasOnChainConfig: boolean;
}) {
  const [showSeasonIdFeedback, setShowSeasonIdFeedback] = useState(false);
  const [showLabelFeedback, setShowLabelFeedback] = useState(false);

  const seasonId = draft?.season_id.trim().toLowerCase() ?? '';
  const usingExistingSeason = isExistingSeasonSelection(
    seasonId,
    chainSeasonIds
  );
  const selectValue = usingExistingSeason ? seasonId : NEW_SEASON_VALUE;
  const seasonIdFormatError =
    draft && selectValue === NEW_SEASON_VALUE
      ? validateSeasonIdDraft(draft.season_id)
      : null;
  const seasonIdFormatReady =
    Boolean(draft?.season_id.trim()) && !seasonIdFormatError;
  const seasonIdFeedbackVisible =
    selectValue === NEW_SEASON_VALUE &&
    showSeasonIdFeedback &&
    Boolean(draft?.season_id.trim());
  const showSeasonIdInvalid =
    seasonIdFeedbackVisible && Boolean(seasonIdFormatError);
  const labelError = draft ? validateSeasonLabelDraft(draft.label) : null;
  const labelFeedbackVisible =
    showLabelFeedback && Boolean(draft?.label.trim());
  const showExistingSeasonLookup =
    refreshing && selectValue !== NEW_SEASON_VALUE;

  const seasonSelectOptions = useMemo(
    () => [
      ...chainSeasonIds.map((id) => ({ value: id, label: id })),
      { value: NEW_SEASON_VALUE, label: 'New season…' },
    ],
    [chainSeasonIds]
  );

  if (loading) {
    return (
      <div className="portal-field-focus rounded-2xl border border-border/40 bg-background/45 px-4 py-3 text-sm text-muted-foreground md:py-3.5">
        Loading season config…
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
        Select a contract and setting to configure the season window.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <PortalFieldSelect
          label="Season"
          value={selectValue}
          options={seasonSelectOptions}
          onChange={(value) => {
            if (value === NEW_SEASON_VALUE) {
              setShowSeasonIdFeedback(false);
              onDraftChange({
                ...draft,
                season_id: usingExistingSeason ? '' : draft.season_id,
              });
              return;
            }

            setShowSeasonIdFeedback(false);
            onSelectExistingSeason(value);
          }}
          disabled={seasonSelectOptions.length === 0}
          placeholder="Select season"
          ariaLabel="Season"
          compact
        />
        <div className="mt-1.5 flex min-h-[1.125rem] items-center">
          {showExistingSeasonLookup ? (
            <PulsingDots size="sm" className="text-muted-foreground" />
          ) : (
            <span className="sr-only">Season status</span>
          )}
        </div>
        {selectValue === NEW_SEASON_VALUE ? (
          <>
            <div
              className={cn(fieldShellClass, 'mt-1 flex min-w-0 items-center')}
            >
              <input
                id="season-config-id"
                className={cn(inputClass, 'font-mono font-medium')}
                value={draft.season_id}
                onChange={(event) => {
                  setShowSeasonIdFeedback(false);
                  onDraftChange({
                    ...draft,
                    season_id: event.target.value.toLowerCase(),
                  });
                }}
                onBlur={() => setShowSeasonIdFeedback(true)}
                placeholder="season-three"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={showSeasonIdInvalid ? true : undefined}
              />
              {draft.season_id.trim() ? (
                <span className="shrink-0 pr-3">
                  {refreshing && seasonIdFormatReady ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center text-muted-foreground">
                      <PulsingDots size="sm" />
                    </span>
                  ) : showSeasonIdInvalid ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                      <X className="h-3 w-3" />
                    </span>
                  ) : lookupReady && seasonIdFormatReady ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-700">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            <AnimatePresence initial={false}>
              {showSeasonIdInvalid && seasonIdFormatError ? (
                <motion.p
                  key="season-id-error"
                  initial={feedbackEnter}
                  animate={feedbackAnimate}
                  exit={feedbackExit}
                  transition={feedbackTransition}
                  className="mt-2 text-xs text-amber-600"
                >
                  {seasonIdFormatError}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </div>

      <div>
        <label className={fieldLabelClass} htmlFor="season-config-label">
          Display name
        </label>
        <div className={cn(fieldShellClass, 'flex min-w-0 items-center')}>
          <input
            id="season-config-label"
            className={inputClass}
            value={draft.label}
            onChange={(event) => {
              setShowLabelFeedback(false);
              onDraftChange({ ...draft, label: event.target.value });
            }}
            onBlur={() => setShowLabelFeedback(true)}
            placeholder="OnSocial Rally"
            autoComplete="off"
            aria-invalid={labelFeedbackVisible && labelError ? true : undefined}
          />
        </div>
        <AnimatePresence initial={false}>
          {labelFeedbackVisible && labelError ? (
            <motion.p
              key="season-label-error"
              initial={feedbackEnter}
              animate={feedbackAnimate}
              exit={feedbackExit}
              transition={feedbackTransition}
              className="mt-2 text-xs text-amber-600"
            >
              {labelError}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div>
          <p className={fieldLabelClass}>Start in</p>
          <RelativeDurationFields
            idPrefix="season-start-offset"
            totalMinutes={draft.start_offset_minutes}
            onTotalMinutesChange={(minutes) =>
              onDraftChange(applySeasonStartOffsetMinutes(draft, minutes))
            }
          />
        </div>

        <div>
          <p className={fieldLabelClass}>Duration</p>
          <RelativeDurationFields
            idPrefix="season-duration"
            totalMinutes={draft.duration_minutes}
            onTotalMinutesChange={(minutes) =>
              onDraftChange({
                ...draft,
                duration_minutes: Math.max(1, minutes),
              })
            }
          />
        </div>
      </div>

      <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-border/40 bg-background/45 px-4 py-2.5 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-border/60"
          checked={!draft.active}
          onChange={(event) =>
            onDraftChange({ ...draft, active: !event.target.checked })
          }
        />
        <span className="font-medium text-foreground">Pause joins</span>
      </label>
    </div>
  );
}

export function useSocialSpendSeasonConfigDraft(
  contractId: string,
  initialSeasonId = 'season-two'
): {
  draft: SocialSpendSeasonConfigDraft | null;
  baseline: SocialSpendSeasonConfigDraft | null;
  chainSeasonIds: string[];
  loading: boolean;
  refreshing: boolean;
  loadError: string | null;
  setDraft: (draft: SocialSpendSeasonConfigDraft) => void;
  selectExistingSeason: (seasonId: string) => void;
  reload: () => void;
  lookupReady: boolean;
  hasOnChainConfig: boolean;
} {
  const normalizedContractId = contractId.trim().toLowerCase();
  const [draft, setDraftState] = useState<SocialSpendSeasonConfigDraft | null>(
    null
  );
  const [baseline, setBaseline] = useState<SocialSpendSeasonConfigDraft | null>(
    null
  );
  const [chainSeasonIds, setChainSeasonIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const initialBootstrapDoneRef = useRef(false);
  const applyBaselineForSeasonIdRef = useRef<string | null>(null);

  const loading = normalizedContractId.length > 0 && draft === null;

  const debouncedSeasonId = useDebouncedValue(
    draft?.season_id.trim().toLowerCase() ?? '',
    SEASON_ID_LOOKUP_DEBOUNCE_MS
  );
  const lookupReady =
    !refreshing &&
    draft != null &&
    debouncedSeasonId === draft.season_id.trim().toLowerCase();
  const hasOnChainConfig =
    baseline != null &&
    baseline.season_id.trim().toLowerCase() ===
      (draft?.season_id.trim().toLowerCase() ?? '');

  useEffect(() => {
    if (!normalizedContractId) {
      setDraftState(null);
      setBaseline(null);
      setChainSeasonIds([]);
      setLoadError(null);
      setRefreshing(false);
      initialBootstrapDoneRef.current = false;
      applyBaselineForSeasonIdRef.current = null;
      return;
    }

    setDraftState(
      (current) => current ?? createDefaultSeasonConfigDraft(initialSeasonId)
    );
  }, [initialSeasonId, normalizedContractId]);

  useEffect(() => {
    if (!normalizedContractId) {
      return;
    }

    void viewContractAt<unknown>(normalizedContractId, 'get_season_ids', {})
      .then((result) => {
        setChainSeasonIds(parseSeasonIdsFromChainView(result));
      })
      .catch(() => {
        setChainSeasonIds([]);
      });
  }, [normalizedContractId, reloadToken]);

  useEffect(() => {
    if (!normalizedContractId || !debouncedSeasonId) {
      setRefreshing(false);
      return;
    }

    if (validateSeasonIdDraft(debouncedSeasonId)) {
      setBaseline(null);
      setRefreshing(false);
      return;
    }

    let cancelled = false;
    setLoadError(null);
    setRefreshing(true);

    void viewContractAt<unknown>(normalizedContractId, 'get_season_config', {
      season_id: debouncedSeasonId,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }

        const parsed = parseSocialSpendSeasonConfigView(result);
        const nextBaseline = parsed
          ? normalizeLoadedDraft(
              socialSpendSeasonConfigToDraft(debouncedSeasonId, parsed)
            )
          : null;

        setBaseline(nextBaseline);

        const shouldApplyFromDropdown =
          applyBaselineForSeasonIdRef.current === debouncedSeasonId;
        const shouldBootstrap =
          nextBaseline &&
          !initialBootstrapDoneRef.current &&
          debouncedSeasonId === initialSeasonId.trim().toLowerCase();

        if (shouldApplyFromDropdown || shouldBootstrap) {
          applyBaselineForSeasonIdRef.current = null;
          if (shouldBootstrap) {
            initialBootstrapDoneRef.current = true;
          }
          setDraftState((current) => {
            if (
              !current ||
              !nextBaseline ||
              current.season_id.trim().toLowerCase() !== debouncedSeasonId
            ) {
              return current;
            }
            return {
              ...nextBaseline,
              season_id: current.season_id,
            };
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not read season config from chain.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSeasonId, initialSeasonId, normalizedContractId, reloadToken]);

  const setDraft = useMemo(
    () => (nextDraft: SocialSpendSeasonConfigDraft) => {
      setDraftState(nextDraft);
    },
    []
  );

  const selectExistingSeason = useMemo(
    () => (seasonId: string) => {
      const normalized = seasonId.trim().toLowerCase();
      applyBaselineForSeasonIdRef.current = normalized;

      setDraftState((current) => {
        if (!current) {
          return current;
        }

        if (
          baseline &&
          baseline.season_id.trim().toLowerCase() === normalized
        ) {
          applyBaselineForSeasonIdRef.current = null;
          return {
            ...baseline,
            season_id: normalized,
          };
        }

        return {
          ...current,
          season_id: normalized,
        };
      });
    },
    [baseline]
  );

  const reload = useMemo(
    () => () => {
      initialBootstrapDoneRef.current = false;
      applyBaselineForSeasonIdRef.current = null;
      setReloadToken((current) => current + 1);
    },
    []
  );

  return {
    draft,
    baseline,
    chainSeasonIds,
    loading,
    refreshing,
    loadError,
    setDraft,
    selectExistingSeason,
    reload,
    lookupReady,
    hasOnChainConfig,
  };
}
