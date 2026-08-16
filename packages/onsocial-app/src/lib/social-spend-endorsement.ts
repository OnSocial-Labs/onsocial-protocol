import type { OnSocial } from '@onsocial/sdk';
import { SOCIAL_SPEND_CONTRACT } from '@/lib/app-config';
import { viewNearContract } from '@/lib/app-near-rpc';
import {
  parseSupportAmountYocto,
  parseSupportProfileActionConfig,
  SUPPORT_PROFILE_MIN_YOCTO,
  type SupportProfileRoutingDisclosure,
} from '@/lib/social-spend-profile';

const APP_SOCIAL_SPEND_APP_ID = 'onpage';

const ENDORSEMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LEGACY_ENDORSEMENT_SPEND_PREFIX = 'legacy:';

export type SupportEndorsementRoutingDisclosure =
  SupportProfileRoutingDisclosure;

export function isEndorsementSpendTargetId(
  value: string | null | undefined
): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (ENDORSEMENT_ID_PATTERN.test(trimmed)) return true;
  return trimmed.startsWith(LEGACY_ENDORSEMENT_SPEND_PREFIX);
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

export interface EndorsementSupportStats {
  totalAmountYocto: string;
  spendCount: number;
  supporterCount: number;
  previewSupporters: Array<{
    accountId: string;
    avatarUrl: string | null;
    totalAmountYocto: string;
  }>;
}

/** Live `support_endorsement` routing from social-spend; null if unavailable. */
export async function fetchSupportEndorsementRouting(): Promise<SupportEndorsementRoutingDisclosure | null> {
  try {
    const config = await viewNearContract<unknown>(
      SOCIAL_SPEND_CONTRACT,
      'get_action_config',
      { action_id: 'support_endorsement' }
    );
    return parseSupportProfileActionConfig(config);
  } catch {
    return null;
  }
}

export function parseSupportEndorsementAmountYocto(
  input: string,
  minYocto: bigint = SUPPORT_PROFILE_MIN_YOCTO
): bigint {
  return parseSupportAmountYocto(input, minYocto);
}

export function buildSupportEndorsementTransaction(
  client: OnSocial,
  input: {
    endorsementId: string;
    recipientAccountId: string;
    amountYocto: string | bigint;
    issuer?: string;
    topic?: string | null;
  }
) {
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

  return client.socialSpend.buildSpendTransaction({
    amount:
      typeof input.amountYocto === 'bigint'
        ? input.amountYocto.toString()
        : input.amountYocto,
    appId: APP_SOCIAL_SPEND_APP_ID,
    action: 'support_endorsement',
    targetType: 'endorsement',
    targetId: endorsementId,
    recipientId: recipientAccountId,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });
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
    previewSupporters?: EndorsementSupportStats['previewSupporters'];
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
