import { createPortalOnSocialClient } from '@/lib/onsocial-client';
import type { SigningWallet } from '@/lib/portal-social-session';
import {
  parseSpendAmountYocto,
  sendPortalWalletTransaction,
  SUPPORT_PROFILE_MIN_YOCTO,
  type PortalSocialSpendTransaction,
} from '@/lib/social-spend-profile';
import { parseSocialSpendActionConfigView } from '@/lib/dao-contract-config-operations';
import { SOCIAL_SPEND_CONTRACT, viewContractAt } from '@/lib/near-rpc';

const os = createPortalOnSocialClient();

const ENDORSEMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LEGACY_ENDORSEMENT_SPEND_PREFIX = 'legacy:';

export function isEndorsementSpendTargetId(
  value: string | null | undefined
): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (ENDORSEMENT_ID_PATTERN.test(trimmed)) return true;
  return trimmed.startsWith(LEGACY_ENDORSEMENT_SPEND_PREFIX);
}

export function isEndorsementSupportId(
  value: string | null | undefined
): boolean {
  return isEndorsementSpendTargetId(value);
}

export function resolveEndorsementSpendTargetId(record: {
  id?: string | null;
  issuer: string;
  target: string;
  topic?: string | null;
}): string | null {
  const rawId = typeof record.id === 'string' ? record.id.trim() : '';
  if (ENDORSEMENT_ID_PATTERN.test(rawId)) {
    return rawId;
  }

  const issuer = record.issuer.trim().toLowerCase();
  const target = record.target.trim().toLowerCase();
  if (!issuer || !target) {
    return null;
  }

  const topic =
    (record.topic ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/gu, '-')
      .replace(/[^a-z0-9._-]+/gu, '-')
      .replace(/-+/gu, '-')
      .replace(/^[.-]+|[.-]+$/gu, '')
      .slice(0, 40) || 'general';

  const legacy = `${LEGACY_ENDORSEMENT_SPEND_PREFIX}${issuer}:${target}:${topic}`;
  if (legacy.length > 256 || /[\u0000-\u001F\u007F]/u.test(legacy)) {
    return null;
  }

  return legacy;
}

export interface EndorsementSupportSubmitInput {
  endorsementId: string;
  recipientAccountId: string;
  amountYocto: string;
  issuer: string;
  topic?: string | null;
}

export interface SupportEndorsementRoutingDisclosure {
  minAmountYocto: bigint;
  treasuryBps: number;
  targetBps: number;
  active: boolean;
}

export async function fetchSupportEndorsementRouting(): Promise<SupportEndorsementRoutingDisclosure | null> {
  const config = await viewContractAt<unknown>(
    SOCIAL_SPEND_CONTRACT,
    'get_action_config',
    { action_id: 'support_endorsement' }
  );
  const parsed = parseSocialSpendActionConfigView(config);
  if (!parsed) {
    return null;
  }

  let minAmountYocto = SUPPORT_PROFILE_MIN_YOCTO;
  try {
    minAmountYocto = BigInt(parsed.min_amount);
  } catch {
    minAmountYocto = SUPPORT_PROFILE_MIN_YOCTO;
  }

  return {
    minAmountYocto,
    treasuryBps: parsed.treasury_bps,
    targetBps: parsed.target_bps,
    active: parsed.active,
  };
}

export function parseSupportAmountYocto(
  input: string,
  minYocto: bigint = SUPPORT_PROFILE_MIN_YOCTO
): bigint {
  return parseSpendAmountYocto(input, minYocto);
}

export function buildSupportEndorsementTransaction(input: {
  endorsementId: string;
  recipientAccountId: string;
  amountYocto: string | bigint;
  issuer?: string;
  topic?: string | null;
}): PortalSocialSpendTransaction {
  const endorsementId = input.endorsementId.trim();
  if (!isEndorsementSpendTargetId(endorsementId)) {
    throw new Error('This endorsement cannot receive support yet.');
  }

  const recipientAccountId = input.recipientAccountId.trim();
  if (!recipientAccountId) {
    throw new Error('Recipient account is required.');
  }

  const metadata: Record<string, string> = {};
  const issuer = input.issuer?.trim();
  const topic = input.topic?.trim();
  if (issuer) metadata.issuer = issuer;
  if (topic) metadata.topic = topic;

  return os.socialSpend.buildSpendTransaction({
    amount:
      typeof input.amountYocto === 'bigint'
        ? input.amountYocto.toString()
        : input.amountYocto,
    appId: 'portal',
    action: 'support_endorsement',
    targetType: 'endorsement',
    targetId: endorsementId,
    recipientId: recipientAccountId,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });
}

export interface EndorsementSupportStats {
  totalAmountYocto: string;
  spendCount: number;
  supporterCount: number;
  previewSupporters: EndorsementSupportPreviewSupporter[];
}

export interface EndorsementSupportPreviewSupporter {
  accountId: string;
  avatarUrl: string | null;
  totalAmountYocto: string;
}

export interface EndorsementSupportContext {
  endorsementId: string;
  totalAmountYocto: string;
  supporterCount: number;
  issuer: string;
  target: string;
  topic: string | null;
  note: string | null;
  issuerName: string | null;
  targetName: string | null;
  issuerAvatarUrl: string | null;
  targetAvatarUrl: string | null;
  previewSupporters: EndorsementSupportPreviewSupporter[];
}

export interface EndorsementSupportGivenRow {
  endorsementId: string;
  recipientId: string | null;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
  issuer: string | null;
  topic: string | null;
  recipientName: string | null;
  recipientAvatarUrl: string | null;
  issuerName: string | null;
  issuerAvatarUrl: string | null;
}

export interface EndorsementSupportGivenResponse {
  items: EndorsementSupportGivenRow[];
  total: number;
}

export interface EndorsementSupporterSummary {
  accountId: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  totalAmountYocto: string;
  spendCount: number;
  latestSupportAt: number | null;
  viewerStanding: boolean;
  theyStandWithViewer: boolean;
}

export interface EndorsementSupportersResponse {
  supporters: EndorsementSupporterSummary[];
  total: number;
}

export async function fetchEndorsementSupportStats(
  endorsementId: string,
  options: { fresh?: boolean } = {}
): Promise<EndorsementSupportStats> {
  const search = new URLSearchParams({ endorsementId });
  if (options.fresh) search.set('fresh', '1');

  const response = await fetch(
    `/api/endorsement/support-total?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as {
    totalAmountYocto?: string;
    spendCount?: number;
    supporterCount?: number;
    previewSupporters?: EndorsementSupportPreviewSupporter[];
    error?: string;
    detail?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Endorsement support stats failed (${response.status})`
    );
  }

  return {
    totalAmountYocto: body?.totalAmountYocto ?? '0',
    spendCount: body?.spendCount ?? 0,
    supporterCount: body?.supporterCount ?? 0,
    previewSupporters: body?.previewSupporters ?? [],
  };
}

export async function fetchEndorsementSupportContext(
  endorsementId: string,
  options: {
    fresh?: boolean;
    issuer?: string | null;
    target?: string | null;
    topic?: string | null;
  } = {}
): Promise<EndorsementSupportContext> {
  const search = new URLSearchParams({ endorsementId });
  if (options.fresh) search.set('fresh', '1');
  if (options.issuer?.trim()) search.set('issuer', options.issuer.trim());
  if (options.target?.trim()) search.set('target', options.target.trim());
  if (options.topic?.trim()) search.set('topic', options.topic.trim());

  const response = await fetch(
    `/api/endorsement/support-context?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (EndorsementSupportContext & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Endorsement support context failed (${response.status})`
    );
  }

  return {
    endorsementId: body?.endorsementId ?? endorsementId,
    totalAmountYocto: body?.totalAmountYocto ?? '0',
    supporterCount: body?.supporterCount ?? 0,
    issuer: body?.issuer ?? '',
    target: body?.target ?? '',
    topic: body?.topic ?? null,
    note: body?.note ?? null,
    issuerName: body?.issuerName ?? null,
    targetName: body?.targetName ?? null,
    issuerAvatarUrl: body?.issuerAvatarUrl ?? null,
    targetAvatarUrl: body?.targetAvatarUrl ?? null,
    previewSupporters: body?.previewSupporters ?? [],
  };
}

export async function fetchEndorsementSupportGiven(
  accountId: string,
  options: { fresh?: boolean; limit?: number; offset?: number } = {}
): Promise<EndorsementSupportGivenResponse> {
  const search = new URLSearchParams({ accountId });
  if (options.fresh) search.set('fresh', '1');
  if (options.limit != null) search.set('limit', String(options.limit));
  if (options.offset != null) search.set('offset', String(options.offset));

  const response = await fetch(
    `/api/endorsement/support-given?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (EndorsementSupportGivenResponse & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Endorsement support given failed (${response.status})`
    );
  }

  return {
    items: body?.items ?? [],
    total: body?.total ?? 0,
  };
}

export async function fetchEndorsementSupporters(
  endorsementId: string,
  options: {
    fresh?: boolean;
    viewerAccountId?: string | null;
    q?: string;
  } = {}
): Promise<EndorsementSupportersResponse> {
  const search = new URLSearchParams({ endorsementId });
  if (options.fresh) search.set('fresh', '1');
  if (options.viewerAccountId?.trim()) {
    search.set('viewerAccountId', options.viewerAccountId.trim());
  }
  if (options.q?.trim()) {
    search.set('q', options.q.trim());
  }

  const response = await fetch(
    `/api/endorsement/supporters?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (EndorsementSupportersResponse & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Endorsement supporters failed (${response.status})`
    );
  }

  return {
    supporters: body?.supporters ?? [],
    total: body?.total ?? 0,
  };
}

/** @deprecated Use fetchEndorsementSupportStats */
export async function fetchEndorsementSupportTotalYocto(
  endorsementId: string,
  options: { fresh?: boolean } = {}
): Promise<EndorsementSupportStats> {
  return fetchEndorsementSupportStats(endorsementId, options);
}

export async function sendSupportEndorsementTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  input: {
    endorsementId: string;
    recipientAccountId: string;
    amountYocto: string | bigint;
    issuer?: string;
    topic?: string | null;
  }
): Promise<string[]> {
  const payload = buildSupportEndorsementTransaction(input);
  return sendPortalWalletTransaction(getSigningWallet, payload);
}
