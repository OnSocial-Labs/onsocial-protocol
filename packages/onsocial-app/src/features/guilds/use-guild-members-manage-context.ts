'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GuildMembersManageContext } from '@/features/guilds/guild-member-row-actions';
import { resolveGuildViewerAccess } from '@/features/guilds/guild-viewer-access';
import { useAppWallet } from '@/contexts/app-wallet-context';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export function useGuildMembersManageContext(
  groupId: string,
  memberDriven: boolean,
  enabled = true
): GuildMembersManageContext {
  const { accountId, isConnected } = useAppWallet();
  const [viewerIsOwner, setViewerIsOwner] = useState(false);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);

  useEffect(() => {
    if (!enabled || !isConnected || !accountId) {
      setViewerIsOwner(false);
      setViewerIsAdmin(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const client = createReadOnlyOnSocialClient();
        const { viewer } = await resolveGuildViewerAccess(
          client,
          groupId,
          accountId,
          {
            memberDriven,
            accessGated: true,
          }
        );
        if (cancelled) return;
        setViewerIsOwner(viewer.isOwner);
        setViewerIsAdmin(viewer.isAdmin);
      } catch {
        if (!cancelled) {
          setViewerIsOwner(false);
          setViewerIsAdmin(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, enabled, groupId, isConnected, memberDriven]);

  return useMemo(
    () => ({
      viewerAccountId: accountId,
      viewerIsOwner,
      viewerIsAdmin,
      memberDriven,
    }),
    [accountId, memberDriven, viewerIsAdmin, viewerIsOwner]
  );
}
