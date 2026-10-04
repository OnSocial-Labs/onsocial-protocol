import type { EndorsementListItem } from '@onsocial/sdk';
import { normalizeEndorsementTopic } from '@onsocial/sdk';
import { formatNearAccountDisplayName } from '@onsocial/ui';
import type { EndorsementsMode } from '@/lib/endorsements-panel-data';
import { formatRelativePostTimestamp } from '@/lib/post-display';

export function humanizeEndorsementTopic(topic?: string | null): string {
  return (topic ?? '').trim().replace(/[-_]+/gu, ' ').replace(/\s+/gu, ' ');
}

export function endorsementTopicKey(topic?: string | null): string {
  return (normalizeEndorsementTopic(topic ?? undefined) ?? '').toLowerCase();
}

export function endorsementTimestampMs(
  item: Pick<EndorsementListItem, 'blockTimestamp' | 'since'>
): number | null {
  const raw = item.blockTimestamp || item.since;
  if (!raw || !Number.isFinite(raw) || raw <= 0) return null;
  if (raw > 1_000_000_000_000_000) return Math.floor(raw / 1_000_000);
  if (raw < 1_000_000_000_000) return raw * 1000;
  return raw;
}

export function formatEndorsementTime(
  item: Pick<EndorsementListItem, 'blockTimestamp' | 'since'>
): string {
  const ms = endorsementTimestampMs(item);
  if (!ms) return '';
  return formatRelativePostTimestamp(ms);
}

export function endorsementPartyLabel(
  accountId: string,
  name?: string | null
): string {
  return formatNearAccountDisplayName(accountId, name);
}

/** Name, account id, topic, and note — the same local match Standing uses. */
export function endorsementRowMatchesQuery(
  item: Pick<EndorsementListItem, 'issuer' | 'target' | 'topic' | 'note'> & {
    issuerName?: string | null;
    targetName?: string | null;
  },
  mode: EndorsementsMode,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const accountId = mode === 'received' ? item.issuer : item.target;
  const name = mode === 'received' ? item.issuerName : item.targetName;
  const haystack = [
    endorsementPartyLabel(accountId, name),
    accountId,
    humanizeEndorsementTopic(item.topic),
    item.note ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}
