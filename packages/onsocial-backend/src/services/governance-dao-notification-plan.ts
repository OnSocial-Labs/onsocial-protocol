const DESCRIPTION_SNIPPET_CHARS = 160;

const TERMINAL_DAO_PROPOSAL_STATUSES = new Set([
  'Approved',
  'Rejected',
  'Removed',
  'Failed',
  'Expired',
  'Moved',
]);

export type DaoNotificationPlan = {
  type: 'dao_proposal' | 'dao_proposal_resolved';
  actor: string;
  recipients: string[];
  dedupeKey: string;
  context: Record<string, unknown>;
};

type ProposalSnapshotSlice = {
  id: number;
  proposer: string;
  description: string;
  kind: Record<string, unknown>;
  status: string;
};

function normalizeAccountId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function isTerminalStatus(status: string | null | undefined): boolean {
  return !!status && TERMINAL_DAO_PROPOSAL_STATUSES.has(status);
}

function proposalKindKey(
  kind: Record<string, unknown> | null | undefined
): string {
  if (!kind || typeof kind !== 'object') return 'Unknown';
  const keys = Object.keys(kind);
  return keys[0] ?? 'Unknown';
}

function descriptionSnippet(description: string | null | undefined): string {
  const trimmed = description?.trim() ?? '';
  if (!trimmed) return '';
  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? trimmed;
  if (firstLine.length <= DESCRIPTION_SNIPPET_CHARS) return firstLine;
  return `${firstLine.slice(0, DESCRIPTION_SNIPPET_CHARS - 1)}…`;
}

function uniqueRecipients(ids: string[], exclude?: string): string[] {
  const skip = normalizeAccountId(exclude);
  const out = new Set<string>();
  for (const id of ids) {
    const normalized = normalizeAccountId(id);
    if (!normalized || normalized === skip) continue;
    out.add(normalized);
  }
  return [...out];
}

/**
 * Pure diff — used by sync + unit tests.
 * Create: notify members (excluding proposer).
 * Terminal status change: notify members (including proposer).
 */
export function planDaoProposalNotifications(params: {
  daoAccountId: string;
  previous: Pick<ProposalSnapshotSlice, 'status'> | null;
  next: ProposalSnapshotSlice;
  memberAccountIds: string[];
}): DaoNotificationPlan[] {
  const daoAccountId = normalizeAccountId(params.daoAccountId);
  if (!daoAccountId) return [];

  const proposalId = params.next.id;
  if (!Number.isInteger(proposalId) || proposalId < 0) return [];

  const proposer = normalizeAccountId(params.next.proposer);
  const status = params.next.status?.trim() || 'Unknown';
  const baseContext = {
    daoAccountId,
    proposalId,
    status,
    kind: proposalKindKey(params.next.kind),
    description: descriptionSnippet(params.next.description),
  };

  const plans: DaoNotificationPlan[] = [];

  if (params.previous == null) {
    const recipients = uniqueRecipients(params.memberAccountIds, proposer);
    if (recipients.length > 0 && proposer) {
      plans.push({
        type: 'dao_proposal',
        actor: proposer,
        recipients,
        dedupeKey: `dao:${daoAccountId}:proposal:${proposalId}:created`,
        context: baseContext,
      });
    }
    return plans;
  }

  const previousStatus = params.previous.status?.trim() || '';
  if (
    previousStatus !== status &&
    isTerminalStatus(status) &&
    !isTerminalStatus(previousStatus)
  ) {
    const recipients = uniqueRecipients(params.memberAccountIds);
    if (recipients.length > 0) {
      plans.push({
        type: 'dao_proposal_resolved',
        actor: daoAccountId,
        recipients,
        dedupeKey: `dao:${daoAccountId}:proposal:${proposalId}:status:${status}`,
        context: baseContext,
      });
    }
  }

  return plans;
}
