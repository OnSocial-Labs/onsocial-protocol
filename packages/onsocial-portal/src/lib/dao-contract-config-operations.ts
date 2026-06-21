import {
  resolveStartOffsetMinutes,
  startsAtLocalFromOffsetMinutes,
} from '@/lib/relative-duration';
import {
  SOCIAL_SPEND_CONTRACT,
  sanitizeSocialAmountInput,
  socialToYocto,
  yoctoToSocial,
} from '@/lib/near-rpc';

export const SOCIAL_SPEND_ROUTING_BPS_DENOMINATOR = 10_000;

export const SOCIAL_SPEND_CONFIG_FUNCTION_CALL_GAS = 100_000_000_000_000;
export const SOCIAL_SPEND_CONFIG_FUNCTION_CALL_DEPOSIT = '1';

export type DaoContractConfigOperationId =
  | 'social_spend_join_rally_routing'
  | 'social_spend_support_profile_routing'
  | 'social_spend_support_endorsement_routing'
  | 'social_spend_boost_post_routing'
  | 'social_spend_set_season_config';

/** Minimum spend for default social-spend actions (0.01 SOCIAL, 18 decimals). */
export const SOCIAL_SPEND_MIN_AMOUNT_YOCTO = '10000000000000000';

/** Upper bound for support min spends in governance UI (100 SOCIAL). */
export const SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_YOCTO =
  '100000000000000000000';

export const SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_SOCIAL_LABEL = '0.01';
export const SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_SOCIAL_LABEL = '100';

/** Default join_rally entry (100 SOCIAL, 18 decimals). */
export const SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_YOCTO = '100000000000000000000';

/** Lower bound for join_rally min in governance UI (1 SOCIAL). */
export const SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_FLOOR_YOCTO =
  '1000000000000000000';

/** Upper bound for join_rally min in governance UI (10,000 SOCIAL). */
export const SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_YOCTO =
  '10000000000000000000000';

export const SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_SOCIAL_LABEL = '1';
export const SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_SOCIAL_LABEL = '10000';

export const DEFAULT_JOIN_RALLY_ROUTING_DRAFT: SocialSpendActionRoutingDraft = {
  label: 'Join Rally',
  active: true,
  min_amount: SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_YOCTO,
  target_types: ['rally'],
  treasury_bps: 500,
  season_pool_bps: 9_500,
  target_bps: 0,
  burn_bps: 0,
  season_required: true,
  allow_self_target: true,
};

export const DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT: SocialSpendActionRoutingDraft =
  {
    label: 'Support Profile',
    active: true,
    min_amount: SOCIAL_SPEND_MIN_AMOUNT_YOCTO,
    target_types: ['profile'],
    treasury_bps: 100,
    season_pool_bps: 0,
    target_bps: 9_900,
    burn_bps: 0,
    season_required: false,
    allow_self_target: false,
  };

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

/** Matches on-chain default for boost_post (10% protocol · 90% post author). */
export const DEFAULT_BOOST_POST_ROUTING_DRAFT: SocialSpendActionRoutingDraft = {
  label: 'Boost Post',
  active: true,
  min_amount: SOCIAL_SPEND_MIN_AMOUNT_YOCTO,
  target_types: ['post'],
  treasury_bps: 1_000,
  season_pool_bps: 0,
  target_bps: 9_000,
  burn_bps: 0,
  season_required: false,
  allow_self_target: true,
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
      id: 'social_spend_support_profile_routing',
      contractId: SOCIAL_SPEND_CONTRACT,
      label: 'Support profile routing',
      description:
        'Register or update support_profile spends (SOCIAL sent to a profile). Recipient claims via target balance; protocol fees route to boost credits.',
      methodName: 'set_action_config',
      gas: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_GAS,
      deposit: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_DEPOSIT,
      prefetchMethod: 'get_action_config',
      prefetchArgs: { action_id: 'support_profile' },
      form: 'social_spend_action_routing',
      actionId: 'support_profile',
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
      id: 'social_spend_boost_post_routing',
      contractId: SOCIAL_SPEND_CONTRACT,
      label: 'Boost post routing',
      description:
        'Update boost_post spends (SOCIAL sent to boost a post). Post author claims via target balance; protocol fees route to boost credits.',
      methodName: 'set_action_config',
      gas: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_GAS,
      deposit: SOCIAL_SPEND_CONFIG_FUNCTION_CALL_DEPOSIT,
      prefetchMethod: 'get_action_config',
      prefetchArgs: { action_id: 'boost_post' },
      form: 'social_spend_action_routing',
      actionId: 'boost_post',
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

export function socialSpendActionRoutingBpsChanged(
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

/** @deprecated Use socialSpendActionRoutingBpsChanged or socialSpendActionDraftChanged */
export function socialSpendActionRoutingChanged(
  baseline: SocialSpendActionRoutingDraft | null,
  draft: SocialSpendActionRoutingDraft | null
): boolean {
  return socialSpendActionRoutingBpsChanged(baseline, draft);
}

export function isSupportSpendRoutingOperationId(
  operationId: DaoContractConfigOperationId | ''
): operationId is
  | 'social_spend_support_profile_routing'
  | 'social_spend_support_endorsement_routing'
  | 'social_spend_boost_post_routing' {
  return (
    operationId === 'social_spend_support_profile_routing' ||
    operationId === 'social_spend_support_endorsement_routing' ||
    operationId === 'social_spend_boost_post_routing'
  );
}

export function isJoinRallyRoutingOperationId(
  operationId: DaoContractConfigOperationId | ''
): operationId is 'social_spend_join_rally_routing' {
  return operationId === 'social_spend_join_rally_routing';
}

export function isSocialSpendRoutingMinEditableOperationId(
  operationId: DaoContractConfigOperationId | ''
): operationId is
  | 'social_spend_join_rally_routing'
  | 'social_spend_support_profile_routing'
  | 'social_spend_support_endorsement_routing'
  | 'social_spend_boost_post_routing' {
  return (
    isJoinRallyRoutingOperationId(operationId) ||
    isSupportSpendRoutingOperationId(operationId)
  );
}

export function validateSocialSpendActionMinAmount(minAmount: string): boolean {
  const trimmed = minAmount.trim();
  if (!/^\d+$/u.test(trimmed)) {
    return false;
  }

  try {
    return BigInt(trimmed) > 0n;
  } catch {
    return false;
  }
}

export function parseSocialSpendMinAmountInputToYocto(
  input: string
): string | null {
  const sanitized = sanitizeSocialAmountInput(input.trim());
  if (!sanitized || sanitized === '0' || sanitized === '0.') {
    return null;
  }

  const yocto = socialToYocto(sanitized);
  return validateSocialSpendActionMinAmount(yocto) ? yocto : null;
}

export function validateSocialSpendSupportMinAmountYocto(
  minAmountYocto: string
): boolean {
  if (!validateSocialSpendActionMinAmount(minAmountYocto)) {
    return false;
  }

  try {
    const value = BigInt(minAmountYocto);
    return (
      value >= BigInt(SOCIAL_SPEND_MIN_AMOUNT_YOCTO) &&
      value <= BigInt(SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_YOCTO)
    );
  } catch {
    return false;
  }
}

/** Clamp and reject out-of-range keystrokes like proposer threshold inputs. */
export function sanitizeSocialSpendSupportMinAmountInput(
  value: string,
  previousValue = ''
): string {
  const sanitized = sanitizeSocialAmountInput(value);
  if (!sanitized) {
    return sanitized;
  }

  const parsedYocto = parseSocialSpendMinAmountInputToYocto(sanitized);
  if (!parsedYocto) {
    return sanitized;
  }

  try {
    const yocto = BigInt(parsedYocto);
    const min = BigInt(SOCIAL_SPEND_MIN_AMOUNT_YOCTO);
    const max = BigInt(SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_YOCTO);

    if (yocto > max) {
      return yoctoToSocial(SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_YOCTO);
    }

    if (yocto < min) {
      const minSocialLabel = SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_SOCIAL_LABEL;
      if (minSocialLabel.startsWith(sanitized) || sanitized.endsWith('.')) {
        return sanitized;
      }

      return previousValue;
    }
  } catch {
    return previousValue;
  }

  return sanitized;
}

export function validateSocialSpendJoinRallyMinAmountYocto(
  minAmountYocto: string
): boolean {
  if (!validateSocialSpendActionMinAmount(minAmountYocto)) {
    return false;
  }

  try {
    const value = BigInt(minAmountYocto);
    return (
      value >= BigInt(SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_FLOOR_YOCTO) &&
      value <= BigInt(SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_YOCTO)
    );
  } catch {
    return false;
  }
}

export function sanitizeSocialSpendJoinRallyMinAmountInput(
  value: string,
  previousValue = ''
): string {
  const sanitized = sanitizeSocialAmountInput(value);
  if (!sanitized) {
    return sanitized;
  }

  const parsedYocto = parseSocialSpendMinAmountInputToYocto(sanitized);
  if (!parsedYocto) {
    return sanitized;
  }

  try {
    const yocto = BigInt(parsedYocto);
    const min = BigInt(SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_FLOOR_YOCTO);
    const max = BigInt(SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_YOCTO);

    if (yocto > max) {
      return yoctoToSocial(SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_YOCTO);
    }

    if (yocto < min) {
      const minSocialLabel = SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_SOCIAL_LABEL;
      if (minSocialLabel.startsWith(sanitized) || sanitized.endsWith('.')) {
        return sanitized;
      }

      return previousValue;
    }
  } catch {
    return previousValue;
  }

  return sanitized;
}

export function validateSocialSpendRoutingMinAmountYocto(
  minAmountYocto: string,
  operationId: DaoContractConfigOperationId | ''
): boolean {
  if (isSupportSpendRoutingOperationId(operationId)) {
    return validateSocialSpendSupportMinAmountYocto(minAmountYocto);
  }

  if (isJoinRallyRoutingOperationId(operationId)) {
    return validateSocialSpendJoinRallyMinAmountYocto(minAmountYocto);
  }

  return validateSocialSpendActionMinAmount(minAmountYocto);
}

export function sanitizeSocialSpendRoutingMinAmountInput(
  value: string,
  previousValue: string,
  operationId: DaoContractConfigOperationId | ''
): string {
  if (isSupportSpendRoutingOperationId(operationId)) {
    return sanitizeSocialSpendSupportMinAmountInput(value, previousValue);
  }

  if (isJoinRallyRoutingOperationId(operationId)) {
    return sanitizeSocialSpendJoinRallyMinAmountInput(value, previousValue);
  }

  return sanitizeSocialAmountInput(value);
}

export function socialSpendActionDraftChanged(
  baseline: SocialSpendActionRoutingDraft | null,
  draft: SocialSpendActionRoutingDraft | null,
  options: {
    includeMinAmount?: boolean;
    includeActive?: boolean;
  } = {}
): boolean {
  if (!baseline || !draft) {
    return false;
  }

  if (socialSpendActionRoutingBpsChanged(baseline, draft)) {
    return true;
  }

  if (options.includeMinAmount && baseline.min_amount !== draft.min_amount) {
    return true;
  }

  if (options.includeActive && baseline.active !== draft.active) {
    return true;
  }

  return false;
}

export function isSocialSpendActionRoutingOperationId(
  operationId: DaoContractConfigOperationId | ''
): operationId is
  | 'social_spend_join_rally_routing'
  | 'social_spend_support_profile_routing'
  | 'social_spend_support_endorsement_routing'
  | 'social_spend_boost_post_routing' {
  return (
    operationId === 'social_spend_join_rally_routing' ||
    operationId === 'social_spend_support_profile_routing' ||
    operationId === 'social_spend_support_endorsement_routing' ||
    operationId === 'social_spend_boost_post_routing'
  );
}

export type SocialSpendRoutingShareFieldKey =
  | 'treasury_bps'
  | 'season_pool_bps'
  | 'target_bps'
  | 'burn_bps';

const SOCIAL_SPEND_ROUTING_SHARE_FIELDS: readonly SocialSpendRoutingShareFieldKey[] =
  ['season_pool_bps', 'treasury_bps', 'target_bps', 'burn_bps'];

export const SOCIAL_SPEND_ROUTING_SHARE_FIELD_LABELS: Record<
  SocialSpendRoutingShareFieldKey,
  string
> = {
  season_pool_bps: 'Pool',
  treasury_bps: 'Fees',
  target_bps: 'Target',
  burn_bps: 'Burn',
};

export function getSocialSpendRoutingFieldLayout(
  operationId: DaoContractConfigOperationId
): {
  primary: readonly SocialSpendRoutingShareFieldKey[];
  secondary: readonly SocialSpendRoutingShareFieldKey[];
} {
  if (operationId === 'social_spend_join_rally_routing') {
    return {
      primary: SOCIAL_SPEND_ROUTING_SHARE_FIELDS,
      secondary: [],
    };
  }

  return {
    primary: ['treasury_bps', 'target_bps'],
    secondary: ['season_pool_bps', 'burn_bps'],
  };
}

export function socialSpendRoutingSecondaryFieldsActive(
  draft: Pick<
    SocialSpendActionRoutingDraft,
    SocialSpendRoutingShareFieldKey
  > | null,
  secondary: readonly SocialSpendRoutingShareFieldKey[]
): boolean {
  if (!draft) {
    return false;
  }

  return secondary.some((field) => draft[field] > 0);
}

export function formatSocialSpendRoutingFixedFieldsCaption(
  operationId: DaoContractConfigOperationId
): string | null {
  if (operationId === 'social_spend_join_rally_routing') {
    return 'Season required · rally target';
  }

  if (operationId === 'social_spend_support_profile_routing') {
    return 'Profile target · label fixed';
  }

  if (operationId === 'social_spend_support_endorsement_routing') {
    return 'Endorsement target · label fixed';
  }

  if (operationId === 'social_spend_boost_post_routing') {
    return 'Post target · self-spend allowed';
  }

  return null;
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

  if (operationId === 'social_spend_support_profile_routing') {
    return {
      actionId: operation.actionId,
      actionLabel: 'support profile',
      defaultDraft: DEFAULT_SUPPORT_PROFILE_ROUTING_DRAFT,
    };
  }

  if (operationId === 'social_spend_support_endorsement_routing') {
    return {
      actionId: operation.actionId,
      actionLabel: 'support endorsement',
      defaultDraft: DEFAULT_SUPPORT_ENDORSEMENT_ROUTING_DRAFT,
    };
  }

  if (operationId === 'social_spend_boost_post_routing') {
    return {
      actionId: operation.actionId,
      actionLabel: 'boost post',
      defaultDraft: DEFAULT_BOOST_POST_ROUTING_DRAFT,
    };
  }

  if (operationId === 'social_spend_join_rally_routing') {
    return {
      actionId: operation.actionId,
      actionLabel: 'join rally',
      defaultDraft: DEFAULT_JOIN_RALLY_ROUTING_DRAFT,
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
  draft: SocialSpendActionRoutingDraft | null,
  operationId: DaoContractConfigOperationId | '' = ''
): boolean {
  if (!draft || !validateSocialSpendActionRoutingBps(draft)) {
    return false;
  }

  const includeMinAmount =
    isSocialSpendRoutingMinEditableOperationId(operationId);
  const includeActive = isSupportSpendRoutingOperationId(operationId);

  if (
    includeMinAmount &&
    !validateSocialSpendRoutingMinAmountYocto(draft.min_amount, operationId)
  ) {
    return false;
  }

  if (!baseline) {
    return true;
  }

  return socialSpendActionDraftChanged(baseline, draft, {
    includeMinAmount,
    includeActive,
  });
}

export function socialSpendActionRoutingProposalBlocker(
  baseline: SocialSpendActionRoutingDraft | null,
  draft: SocialSpendActionRoutingDraft | null,
  operationId: DaoContractConfigOperationId | ''
): string | null {
  if (!draft) {
    return null;
  }

  if (!validateSocialSpendActionRoutingBps(draft)) {
    return 'Routing shares must sum to 100% (10,000 bps).';
  }

  if (
    isSocialSpendRoutingMinEditableOperationId(operationId) &&
    !validateSocialSpendRoutingMinAmountYocto(draft.min_amount, operationId)
  ) {
    if (isJoinRallyRoutingOperationId(operationId)) {
      return `Enter a minimum spend between ${SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_SOCIAL_LABEL} and ${SOCIAL_SPEND_JOIN_RALLY_MIN_AMOUNT_MAX_SOCIAL_LABEL} SOCIAL.`;
    }

    return `Enter a minimum spend between ${SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_SOCIAL_LABEL} and ${SOCIAL_SPEND_SUPPORT_MIN_AMOUNT_MAX_SOCIAL_LABEL} SOCIAL.`;
  }

  if (
    baseline &&
    !canProposeSocialSpendActionRoutingDraft(baseline, draft, operationId)
  ) {
    if (isSupportSpendRoutingOperationId(operationId)) {
      return 'Change at least one routing share, minimum spend, or active flag before proposing.';
    }

    if (isJoinRallyRoutingOperationId(operationId)) {
      return 'Change at least one routing share or minimum spend before proposing.';
    }

    return 'Change at least one routing share before proposing.';
  }

  return null;
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

/** Yocto min from on-chain / proposal config — string only (JSON numbers lose u128 precision). */
export function readSocialSpendActionMinAmountYocto(
  config: unknown
): string | undefined {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  const raw = (config as Record<string, unknown>).min_amount;
  if (typeof raw !== 'string') {
    return undefined;
  }

  const trimmed = raw.trim();
  return validateSocialSpendActionMinAmount(trimmed) ? trimmed : undefined;
}

export function formatSocialSpendMinAmountCardLabel(
  minAmountYocto: string | undefined
): string | null {
  const trimmed = minAmountYocto?.trim();
  if (!trimmed || !validateSocialSpendActionMinAmount(trimmed)) {
    return null;
  }

  return `min ${yoctoToSocial(trimmed)} SOCIAL`;
}

export function formatSocialSpendActionConfigCardSummary(
  draft: Pick<
    SocialSpendActionRoutingDraft,
    | 'treasury_bps'
    | 'season_pool_bps'
    | 'target_bps'
    | 'burn_bps'
    | 'min_amount'
  >,
  options?: { protocolFeesRouteToBoost?: boolean; includeMinAmount?: boolean }
): string {
  const routing = formatSocialSpendActionRoutingSummary(draft, options);
  if (options?.includeMinAmount === false) {
    return routing;
  }

  const minLabel = formatSocialSpendMinAmountCardLabel(draft.min_amount);
  if (!minLabel) {
    return routing;
  }

  return routing === 'No routing' ? minLabel : `${minLabel} · ${routing}`;
}

export function formatSocialSpendActionConfigCardSummaryFromRecord(
  config: unknown,
  options?: { protocolFeesRouteToBoost?: boolean; includeMinAmount?: boolean }
): string {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return formatSocialSpendActionRoutingSummary({
      treasury_bps: 0,
      season_pool_bps: 0,
      target_bps: 0,
      burn_bps: 0,
    });
  }

  const record = config as Record<string, unknown>;
  const readBps = (field: string): number =>
    typeof record[field] === 'number' && Number.isFinite(record[field])
      ? (record[field] as number)
      : 0;

  return formatSocialSpendActionConfigCardSummary(
    {
      treasury_bps: readBps('treasury_bps'),
      season_pool_bps: readBps('season_pool_bps'),
      target_bps: readBps('target_bps'),
      burn_bps: readBps('burn_bps'),
      min_amount: readSocialSpendActionMinAmountYocto(record),
    },
    options
  );
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
