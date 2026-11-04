'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  hubUsesCreatorRoster,
  type AppView,
} from '@/features/scarces/apps-data';

export type HubRosterRole = 'owner' | 'moderator' | 'approved_creator';

export type HubRosterRow = {
  accountId: string;
  role: HubRosterRole;
  roleLabel: string;
  addedAtNs: number | null;
};

const ROLE_ORDER: Record<HubRosterRole, number> = {
  owner: 0,
  moderator: 1,
  approved_creator: 2,
};

function hubRosterTimestampKey(role: HubRosterRole, accountId: string): string {
  return `${role}:${accountId.trim().toLowerCase()}`;
}

export function buildHubRosterRows(app: AppView): HubRosterRow[] {
  const seen = new Set<string>();
  const rows: HubRosterRow[] = [];
  const push = (accountId: string, role: HubRosterRole, roleLabel: string) => {
    const id = accountId.trim();
    if (!id || seen.has(id.toLowerCase())) return;
    seen.add(id.toLowerCase());
    rows.push({ accountId: id, role, roleLabel, addedAtNs: null });
  };

  push(app.ownerId, 'owner', 'Owner');
  for (const id of app.moderators) push(id, 'moderator', 'Moderator');
  if (hubUsesCreatorRoster(app.creatorAccess)) {
    for (const id of app.approvedCreators) {
      push(id, 'approved_creator', 'Creator');
    }
  }

  return sortHubRosterRows(rows);
}

export function sortHubRosterRows(rows: HubRosterRow[]): HubRosterRow[] {
  return [...rows].sort((a, b) => {
    const byRole = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    if (byRole !== 0) return byRole;
    const ta = a.addedAtNs ?? Number.MAX_SAFE_INTEGER;
    const tb = b.addedAtNs ?? Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.accountId.localeCompare(b.accountId);
  });
}

export function attachHubRosterTimes(
  rows: HubRosterRow[],
  addedTimes: Map<string, number>
): HubRosterRow[] {
  return sortHubRosterRows(
    rows.map((row) => {
      const ts = addedTimes.get(hubRosterTimestampKey(row.role, row.accountId));
      return ts == null ? row : { ...row, addedAtNs: ts };
    })
  );
}

export type HubRosterTiming = {
  addedTimes: Map<string, number>;
  hubCreatedTimestamp: number | null;
};

export async function fetchHubRosterTiming(
  appId: string
): Promise<HubRosterTiming> {
  const id = appId.trim();
  const addedTimes = new Map<string, number>();
  if (!id) {
    return { addedTimes, hubCreatedTimestamp: null };
  }

  try {
    const { createReadOnlyOnSocialClient } = await import(
      '@/lib/create-readonly-onsocial-client'
    );
    const client = createReadOnlyOnSocialClient();
    const res = await client.query.graphql<{
      scarcesAppCreators: Array<{
        accountId: string;
        role: string;
        addedBlockTimestamp: number | null;
      }>;
      scarcesApps: Array<{ createdBlockTimestamp: number | null }>;
    }>({
      query: `query HubRosterTimes($appId: String!) {
        scarcesAppCreators(where: {appId: {_eq: $appId}}, limit: 300) {
          accountId
          role
          addedBlockTimestamp
        }
        scarcesApps(where: {appId: {_eq: $appId}}, limit: 1) {
          createdBlockTimestamp
        }
      }`,
      variables: { appId: id },
    });

    for (const row of res.data?.scarcesAppCreators ?? []) {
      const accountId = row.accountId?.trim();
      const role = row.role?.trim() as HubRosterRole | undefined;
      if (!accountId || !role) continue;
      if (
        role !== 'owner' &&
        role !== 'moderator' &&
        role !== 'approved_creator'
      ) {
        continue;
      }
      const ts = row.addedBlockTimestamp;
      if (ts == null || !Number.isFinite(ts)) continue;
      addedTimes.set(hubRosterTimestampKey(role, accountId), ts);
    }

    const hubCreated = res.data?.scarcesApps?.[0]?.createdBlockTimestamp;
    const hubCreatedTimestamp =
      hubCreated != null && Number.isFinite(hubCreated) ? hubCreated : null;

    return { addedTimes, hubCreatedTimestamp };
  } catch {
    // Graph may be unavailable in dev — roster still renders from chain pool.
  }

  return { addedTimes, hubCreatedTimestamp: null };
}

/** Owner row time when Graph has no `role: owner` roster row yet. */
export function applyOwnerHubCreatedFallback(
  rows: HubRosterRow[],
  hubCreatedTimestamp: number | null | undefined,
  createdAtMs?: number
): HubRosterRow[] {
  const fallback =
    hubCreatedTimestamp ??
    (createdAtMs != null && Number.isFinite(createdAtMs) ? createdAtMs : null);
  if (fallback == null) return rows;

  return rows.map((row) =>
    row.role === 'owner' && row.addedAtNs == null
      ? { ...row, addedAtNs: fallback }
      : row
  );
}

export function mergeHubRosterRows(
  app: AppView,
  timing: HubRosterTiming
): HubRosterRow[] {
  const rows = attachHubRosterTimes(buildHubRosterRows(app), timing.addedTimes);
  return applyOwnerHubCreatedFallback(
    rows,
    timing.hubCreatedTimestamp,
    app.createdAtMs
  );
}

export function hubRosterIsOwnerOnly(rows: HubRosterRow[]): boolean {
  return rows.length === 1 && rows[0]?.role === 'owner';
}

export function useHubRoster(app: AppView, enabled: boolean): HubRosterRow[] {
  const chainRows = useMemo(
    () =>
      applyOwnerHubCreatedFallback(buildHubRosterRows(app), null, app.createdAtMs),
    [app]
  );
  const [rows, setRows] = useState(chainRows);

  useEffect(() => {
    setRows(chainRows);
  }, [chainRows]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchHubRosterTiming(app.appId).then((timing) => {
      if (cancelled) return;
      setRows(mergeHubRosterRows(app, timing));
    });
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    app,
    app.appId,
    app.ownerId,
    app.moderators,
    app.approvedCreators,
    app.creatorAccess,
    app.createdAtMs,
  ]);

  return rows;
}
