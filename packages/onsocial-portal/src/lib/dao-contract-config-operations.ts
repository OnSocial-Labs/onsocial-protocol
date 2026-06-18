import {
  resolveStartOffsetMinutes,
  startsAtLocalFromOffsetMinutes,
} from '@/lib/relative-duration';
import { SOCIAL_SPEND_CONTRACT } from '@/lib/near-rpc';

export const SOCIAL_SPEND_ROUTING_BPS_DENOMINATOR = 10_000;

export const SOCIAL_SPEND_CONFIG_FUNCTION_CALL_GAS = 100_000_000_000_000;
export const SOCIAL_SPEND_CONFIG_FUNCTION_CALL_DEPOSIT = '1';

export type DaoContractConfigOperationId =
  | 'social_spend_join_rally_routing'
  | 'social_spend_support_endorsement_routing'
  | 'social_spend_set_season_config';

/** Minimum spend for default social-spend actions (0.01 SOCIAL, 18 decimals). */
export const SOCIAL_SPEND_MIN_AMOUNT_YOCTO = '10000000000000000';

export const DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT: SocialSpendActionRoutingDraft =
  {
    label: 'Support Endorsement',
    active: true,
    min_amount: SOCIAL_SPEND_MIN_AMOUNT_YOCTO,
    target_types: ['endorsement'],
    treasury_bps: 100,
    season_pool_bps: 0,
    target_bps: 9_900,
    burn_bps: 0,
    season_required: false,
    allow_self_target: false,
  };

export interface SocialSpendActionConfigView {
  label: string;
  active: boolean;
  min_amount: string;
  target_types: string[];
  treasury_bps: number;
  season_pool_bps: number;
  target_bps: number;
  burn_bps: number;
  season_required: boolean;
  allow_self_target: boolean;
}

export interface SocialSpendActionRoutingDraft {
  label: string;
  active: boolean;
  min_amount: string;
  target_types: string[];
  treasury_bps: number;
  season_pool_bps: number;
  target_bps: number;
  burn_bps: number;
  season_required: boolean;
  allow_self_target: boolean;
}

export type DaoContractConfigForm =
  | 'social_spend_action_routing'
  | 'social_spend_season_config';

export interface SocialSpendSeasonConfigView {
  label: string;
  active: boolean;
  starts_at_ns: string;
  ends_at_ns: string;
  claim_starts_at_ns?: string | null;
}

export interface SocialSpendSeasonConfigDraft {
  season_id: string;
  label: string;
  /** When false, join_rally spends for this season are rejected even inside the window. */
  active: boolean;
  /** Relative start delay edited in the form; synced to starts_at_local on change. */
  start_offset_minutes: number;
  starts_at_local: string;
  /** Spend window length in minutes; end time is derived for the on-chain proposal. */
  duration_minutes: number;
}

const HIDDEN_GOV_SEASON_IDS = new Set(['season0']);

export function parseSeasonIdsFromChainView(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .filter((seasonId) => !HIDDEN_GOV_SEASON_IDS.has(seasonId))
    .sort((left, right) => left.localeCompare(right));
}

const SEASON_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u;

export interface DaoContractConfigOperationDefinition {
  id: DaoContractConfigOperationId;
  contractId: string;
  label: string;
  description: string;
  methodName: 'set_action_config' | 'set_season_config';
  gas: number;
  deposit: string;
  prefetchMethod?:
    | 'get_action_config'
    | 'get_contract_info'
    | 'get_season_config';
  prefetchArgs?: Record<string, unknown>;
  form: DaoContractConfigForm;
  actionId?: string;
}

export const DAO_CONTRACT_CONFIG_OPERATIONS: readonly DaoContractConfigOperationDefinition[] =
  [
    {
      id: 'social_spend_join_rally_routing',
      contractId: SOCIAL_SPEND_CONTRACT,
      label: 'Join rally routing',
      description:
        'Set season pool, protocol fee, target, and burn shares for join_rally spends. Protocol fees route to boost credits automatically.',
      methodName: 'set_action_config',
      gas: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_GAS,
      deposit: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_DEPOSIT,
      prefetchMethod: 'get_action_config',
      prefetchArgs: { action_id: 'join_rally' },
      form: 'social_spend_action_routing',
      actionId: 'join_rally',
    },
    {
      id: 'social_spend_support_endorsement_routing',
      contractId: SOCIAL_SPEND_CONTRACT,
      label: 'Support endorsement routing',
      description:
        'Register or update support_endorsement spends (SOCIAL backing a specific endorsement). Recipient claims via target balance; protocol fees route to boost credits.',
      methodName: 'set_action_config',
      gas: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_GAS,
      deposit: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_DEPOSIT,
      prefetchMethod: 'get_action_config',
      prefetchArgs: { action_id: 'support_endorsement' },
      form: 'social_spend_action_routing',
      actionId: 'support_endorsement',
    },
    {
      id: 'social_spend_set_season_config',
      contractId: SOCIAL_SPEND_CONTRACT,
      label: 'Rally season window',
      description: 'Set season open time, duration, and pause state.',
      methodName: 'set_season_config',
      gas: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_GAS,
      deposit: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_DEPOSIT,
      prefetchMethod: 'get_season_config',
      form: 'social_spend_season_config',
    },
  ];

export function getDaoContractConfigOperation(
  operationId: DaoContractConfigOperationId
): DaoContractConfigOperationDefinition | null {
  return (
    DAO_CONTRACT_CONFIG_OPERATIONS.find(
      (operation) => operation.id === operationId
    ) ?? null
  );
}

export function getDaoContractConfigOperationsForContract(
  contractId: string
): DaoContractConfigOperationDefinition[] {
  const normalized = contractId.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return DAO_CONTRACT_CONFIG_OPERATIONS.filter(
    (operation) => operation.contractId.toLowerCase() === normalized
  );
}

export function getDaoManagedContractsWithConfigOperations(
  managedContractIds: readonly string[]
): string[] {
  const managed = new Set(
    managedContractIds.map((contractId) => contractId.trim().toLowerCase())
  );

  return [
    ...new Set(
      DAO_CONTRACT_CONFIG_OPERATIONS.map((operation) =>
        operation.contractId.toLowerCase()
      )
    ),
  ]
    .filter((contractId) => managed.has(contractId))
    .sort((left, right) => left.localeCompare(right));
}

export function parseSocialSpendActionConfigView(
  value: unknown
): SocialSpendActionConfigView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!label) {
    return null;
  }

  const minAmount =
    typeof record.min_amount === 'string'
      ? record.min_amount.trim()
      : typeof record.min_amount === 'number'
        ? String(record.min_amount)
        : '';
  if (!/^\d+$/.test(minAmount)) {
    return null;
  }

  const targetTypes = Array.isArray(record.target_types)
    ? record.target_types.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim().length > 0
      )
    : [];
  if (targetTypes.length === 0) {
    return null;
  }

  const readBps = (field: string): number | null => {
    const raw = record[field];
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
      return null;
    }
    return raw;
  };

  const treasury_bps = readBps('treasury_bps');
  const season_pool_bps = readBps('season_pool_bps');
  const target_bps = readBps('target_bps');
  const burn_bps = readBps('burn_bps');
  if (
    treasury_bps == null ||
    season_pool_bps == null ||
    target_bps == null ||
    burn_bps == null
  ) {
    return null;
  }

  return {
    label,
    active: record.active === true,
    min_amount: minAmount,
    target_types: targetTypes,
    treasury_bps,
    season_pool_bps,
    target_bps,
    burn_bps,
    season_required: record.season_required === true,
    allow_self_target: record.allow_self_target === true,
  };
}

export function socialSpendActionConfigToDraft(
  config: SocialSpendActionConfigView
): SocialSpendActionRoutingDraft {
  return { ...config };
}

export function sumSocialSpendActionRoutingBps(
  draft: Pick<
    SocialSpendActionRoutingDraft,
    'treasury_bps' | 'season_pool_bps' | 'target_bps' | 'burn_bps'
  >
): number {
  return (
    draft.treasury_bps +
    draft.season_pool_bps +
    draft.target_bps +
    draft.burn_bps
  );
}

export function validateSocialSpendActionRoutingBps(
  draft: Pick<
    SocialSpendActionRoutingDraft,
    'treasury_bps' | 'season_pool_bps' | 'target_bps' | 'burn_bps'
  >
): boolean {
  const fields = [
    draft.treasury_bps,
    draft.season_pool_bps,
    draft.target_bps,
    draft.burn_bps,
  ];

  if (
    fields.some(
      (value) => !Number.isInteger(value) || value < 0 || value > 10_000
    )
  ) {
    return false;
  }

  return (
    sumSocialSpendActionRoutingBps(draft) ===
    SOCIAL_SPEND_ROUTING_BPS_DENOMINATOR
  );
}

export function socialSpendActionRoutingChanged(
  baseline: SocialSpendActionRoutingDraft | null,
  draft: SocialSpendActionRoutingDraft | null
): boolean {
  if (!baseline || !draft) {
    return false;
  }

  return (
    baseline.treasury_bps !== draft.treasury_bps ||
    baseline.season_pool_bps !== draft.season_pool_bps ||
    baseline.target_bps !== draft.target_bps ||
    baseline.burn_bps !== draft.burn_bps
  );
}

export function isSocialSpendActionRoutingOperationId(
  operationId: DaoContractConfigOperationId | ''
): operationId is
  | 'social_spend_join_rally_routing'
  | 'social_spend_support_endorsement_routing' {
  return (
    operationId === 'social_spend_join_rally_routing' ||
    operationId === 'social_spend_support_endorsement_routing'
  );
}

export interface SocialSpendActionRoutingOperationConfig {
  actionId: string;
  actionLabel: string;
  defaultDraft: SocialSpendActionRoutingDraft | null;
}

export function getSocialSpendActionRoutingOperationConfig(
  operationId: DaoContractConfigOperationId
): SocialSpendActionRoutingOperationConfig | null {
  const operation = getDaoContractConfigOperation(operationId);
  if (
    !operation ||
    operation.form !== 'social_spend_action_routing' ||
    !operation.actionId
  ) {
    return null;
  }

  if (operationId === 'social_spend_support_endorsement_routing') {
    return {
      actionId: operation.actionId,
      actionLabel: 'support endorsement',
      defaultDraft: DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT,
    };
  }

  return {
    actionId: operation.actionId,
    actionLabel: operation.actionId.replaceAll('_', ' '),
    defaultDraft: null,
  };
}

export function canProposeSocialSpendActionRoutingDraft(
  baseline: SocialSpendActionRoutingDraft | null,
  draft: SocialSpendActionRoutingDraft | null
): boolean {
  if (!draft || !validateSocialSpendActionRoutingBps(draft)) {
    return false;
  }

  if (!baseline) {
    return true;
  }

  return socialSpendActionRoutingChanged(baseline, draft);
}

export function formatSocialSpendActionRoutingSummary(
  draft: Pick<
    SocialSpendActionRoutingDraft,
    'treasury_bps' | 'season_pool_bps' | 'target_bps' | 'burn_bps'
  >,
  options?: { protocolFeesRouteToBoost?: boolean }
): string {
  const parts: string[] = [];
  if (draft.season_pool_bps > 0) {
    parts.push(`${draft.season_pool_bps / 100}% pool`);
  }
  if (draft.treasury_bps > 0) {
    parts.push(
      options?.protocolFeesRouteToBoost === false
        ? `${draft.treasury_bps / 100}% fees`
        : `${draft.treasury_bps / 100}% boost credits`
    );
  }
  if (draft.burn_bps > 0) {
    parts.push(`${draft.burn_bps / 100}% burn`);
  }
  if (draft.target_bps > 0) {
    parts.push(`${draft.target_bps / 100}% target`);
  }
  return parts.join(' · ') || 'No routing';
}

export function nsToDatetimeLocalValue(ns: string): string {
  if (!/^\d+$/u.test(ns)) {
    return '';
  }
  const ms = Number(BigInt(ns) / 1_000_000n);
  if (!Number.isFinite(ms)) {
    return '';
  }
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function datetimeLocalToNs(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    return null;
  }
  return (BigInt(ms) * 1_000_000n).toString();
}

export function parseSocialSpendSeasonConfigView(
  value: unknown
): SocialSpendSeasonConfigView | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const label = typeof record.label === 'string' ? record.label.trim() : '';
  if (!label) {
    return null;
  }

  const readNs = (field: string): string | null => {
    const raw = record[field];
    if (typeof raw === 'string' && /^\d+$/u.test(raw.trim())) {
      return raw.trim();
    }
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) {
      return String(raw);
    }
    return null;
  };

  const starts_at_ns = readNs('starts_at_ns');
  const ends_at_ns = readNs('ends_at_ns');
  if (!starts_at_ns || !ends_at_ns) {
    return null;
  }

  const claimRaw = record.claim_starts_at_ns;
  const claim_starts_at_ns =
    typeof claimRaw === 'string' && /^\d+$/u.test(claimRaw.trim())
      ? claimRaw.trim()
      : typeof claimRaw === 'number' &&
          Number.isInteger(claimRaw) &&
          claimRaw >= 0
        ? String(claimRaw)
        : null;

  return {
    label,
    active: record.active === true,
    starts_at_ns,
    ends_at_ns,
    claim_starts_at_ns,
  };
}

export function resolveSeasonDurationMinutes(
  starts_at_ns: string,
  ends_at_ns: string
): number {
  const durationNs = BigInt(ends_at_ns) - BigInt(starts_at_ns);
  if (durationNs <= 0n) {
    return 60;
  }
  const minutes = Number(durationNs / (60n * 1_000_000_000n));
  return Math.max(1, minutes);
}

export function computeSeasonEndsAtLocal(
  starts_at_local: string,
  duration_minutes: number
): string {
  const startsMs = Date.parse(starts_at_local);
  if (!Number.isFinite(startsMs) || duration_minutes <= 0) {
    return '';
  }
  const endsMs = startsMs + duration_minutes * 60_000;
  return nsToDatetimeLocalValue(String(BigInt(endsMs) * 1_000_000n));
}

export function socialSpendSeasonConfigToDraft(
  seasonId: string,
  config: SocialSpendSeasonConfigView
): SocialSpendSeasonConfigDraft {
  const starts_at_local = nsToDatetimeLocalValue(config.starts_at_ns);
  return {
    season_id: seasonId,
    label: config.label,
    active: config.active,
    start_offset_minutes: resolveStartOffsetMinutes(starts_at_local),
    starts_at_local,
    duration_minutes: resolveSeasonDurationMinutes(
      config.starts_at_ns,
      config.ends_at_ns
    ),
  };
}

export function applySeasonStartOffsetMinutes(
  draft: SocialSpendSeasonConfigDraft,
  offsetMinutes: number
): SocialSpendSeasonConfigDraft {
  const safe = Math.max(0, Math.floor(offsetMinutes));
  return {
    ...draft,
    start_offset_minutes: safe,
    starts_at_local: startsAtLocalFromOffsetMinutes(safe),
  };
}

export function createDefaultSeasonConfigDraft(
  seasonId = 'season-two'
): SocialSpendSeasonConfigDraft {
  const start_offset_minutes = 7 * 24 * 60;

  return {
    season_id: seasonId,
    label: 'OnSocial Rally',
    active: true,
    start_offset_minutes,
    starts_at_local: startsAtLocalFromOffsetMinutes(start_offset_minutes),
    duration_minutes: 420,
  };
}

export function validateSeasonIdDraft(seasonId: string): string | null {
  const normalized = seasonId.trim().toLowerCase();
  if (!normalized) {
    return 'Enter a season id.';
  }
  if (!SEASON_ID_PATTERN.test(normalized)) {
    return 'Use lowercase letters, numbers, dash, dot, or underscore.';
  }
  return null;
}

export function validateSeasonLabelDraft(label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) {
    return 'Enter a display name.';
  }
  if (trimmed.length > 64 || /[\u0000-\u001F\u007F]/u.test(trimmed)) {
    return 'Display name must be 1–64 characters.';
  }
  return null;
}

export function validateSeasonConfigDraft(
  draft: SocialSpendSeasonConfigDraft
): string | null {
  const seasonIdError = validateSeasonIdDraft(draft.season_id);
  if (seasonIdError) {
    return seasonIdError;
  }
  const labelError = validateSeasonLabelDraft(draft.label);
  if (labelError) {
    return labelError;
  }

  if (!datetimeLocalToNs(draft.starts_at_local)) {
    return 'Enter a valid start time.';
  }

  const startsMs = Date.parse(draft.starts_at_local);
  if (!Number.isFinite(startsMs) || startsMs <= Date.now()) {
    return 'Start must be in the future.';
  }

  if (!Number.isFinite(draft.duration_minutes) || draft.duration_minutes <= 0) {
    return 'Duration must be greater than zero.';
  }

  return null;
}

export function seasonConfigDraftToInput(draft: SocialSpendSeasonConfigDraft): {
  season_id: string;
  config: {
    label: string;
    active: boolean;
    starts_at_ns: number;
    ends_at_ns: number;
    claim_starts_at_ns: number | null;
  };
} {
  const startsNs = datetimeLocalToNs(draft.starts_at_local)!;
  const endsLocal = computeSeasonEndsAtLocal(
    draft.starts_at_local,
    draft.duration_minutes
  );
  const endsNs = datetimeLocalToNs(endsLocal)!;

  return {
    season_id: draft.season_id.trim().toLowerCase(),
    config: {
      label: draft.label.trim(),
      active: draft.active,
      starts_at_ns: Number(startsNs),
      ends_at_ns: Number(endsNs),
      claim_starts_at_ns: null,
    },
  };
}

export function formatSeasonConfigSummary(
  draft: SocialSpendSeasonConfigDraft
): string {
  const seasonId = draft.season_id.trim().toLowerCase();
  const validationError = validateSeasonConfigDraft(draft);
  if (validationError) {
    return validationError;
  }

  const startsMs = Date.parse(draft.starts_at_local);
  const endsLocal = computeSeasonEndsAtLocal(
    draft.starts_at_local,
    draft.duration_minutes
  );
  const endsMs = Date.parse(endsLocal);
  if (!Number.isFinite(startsMs) || !Number.isFinite(endsMs)) {
    return seasonId;
  }

  const formatPoint = (ms: number) =>
    new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const pauseSuffix = draft.active ? '' : ', paused';
  return `${seasonId} · ${formatPoint(startsMs)} → ${formatPoint(endsMs)}${pauseSuffix}`;
}

export function seasonConfigDraftChanged(
  baseline: SocialSpendSeasonConfigDraft | null,
  draft: SocialSpendSeasonConfigDraft | null
): boolean {
  if (!baseline || !draft) {
    return false;
  }

  return JSON.stringify(baseline) !== JSON.stringify(draft);
}
