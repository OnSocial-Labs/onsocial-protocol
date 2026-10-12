import type { StandingAccountSummary } from '@/lib/profile-social-standings';

export interface StandingViewerLines {
  viewerOutgoingPeerIds: string[];
  viewerIncomingPeerIds: string[];
  viewerEndorsementIssuerIds: string[];
  viewerEndorsementTargetIds: string[];
}

const EMPTY_LINES: StandingViewerLines = {
  viewerOutgoingPeerIds: [],
  viewerIncomingPeerIds: [],
  viewerEndorsementIssuerIds: [],
  viewerEndorsementTargetIds: [],
};

function asIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
}

/** Join viewer edges onto people already listed. Missing ids stay false. */
export function applyStandingViewerLines(
  accounts: StandingAccountSummary[],
  lines: StandingViewerLines
): StandingAccountSummary[] {
  const outgoing = new Set(lines.viewerOutgoingPeerIds);
  const incoming = new Set(lines.viewerIncomingPeerIds);
  const endorsedViewer = new Set(lines.viewerEndorsementIssuerIds);
  const viewerEndorsed = new Set(lines.viewerEndorsementTargetIds);
  return accounts.map((account) => ({
    ...account,
    viewerStanding: outgoing.has(account.accountId),
    theyStandWithViewer: incoming.has(account.accountId),
    targetEndorsedViewer: endorsedViewer.has(account.accountId),
    viewerEndorsed: viewerEndorsed.has(account.accountId),
  }));
}

export async function fetchStandingViewerLines(
  viewerAccountId: string,
  peerIds: string[]
): Promise<StandingViewerLines> {
  const unique = [
    ...new Set(peerIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (unique.length === 0) return EMPTY_LINES;

  const search = new URLSearchParams({ viewerAccountId });
  for (const id of unique) search.append('peerId', id);
  const response = await fetch(
    `/api/profile/social/standing-viewer-lines?${search.toString()}`,
    { cache: 'no-store' }
  );
  const body = (await response.json().catch(() => null)) as
    | (Partial<StandingViewerLines> & { error?: string; detail?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.detail ??
        body?.error ??
        `Standing viewer lines failed (${response.status})`
    );
  }

  return {
    viewerOutgoingPeerIds: asIds(body?.viewerOutgoingPeerIds),
    viewerIncomingPeerIds: asIds(body?.viewerIncomingPeerIds),
    viewerEndorsementIssuerIds: asIds(body?.viewerEndorsementIssuerIds),
    viewerEndorsementTargetIds: asIds(body?.viewerEndorsementTargetIds),
  };
}
