'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GroupMembershipCurrentRow } from '@onsocial/sdk';
import { normalizeGuildConfig } from '@/features/guilds/guild-config';
import {
  composerGuildSpaces,
  defaultComposerSpace,
  type GuildSpace,
  type GuildViewerAccess,
} from '@/features/guilds/guild-structure';
import { createReadOnlyOnSocialClient } from '@/lib/create-readonly-onsocial-client';

export const COMPOSER_PERSONAL_TARGET = 'personal';

function accessFromMembership(
  row: GroupMembershipCurrentRow
): GuildViewerAccess {
  return {
    isMember: true,
    canModerate: Boolean(row.canModerate || row.isAdmin || row.isOwner),
    isAdmin: Boolean(row.isAdmin || row.isOwner),
    isOwner: Boolean(row.isOwner),
  };
}

/**
 * Public + joined guilds for the composer destination menus (feed / Drop).
 * Loads memberships when `active`, and guild rooms when a guild is selected.
 */
export function useComposerFeedTargets(args: {
  active: boolean;
  accountId: string | null | undefined;
  targetId: string;
  onError?: (message: string) => void;
}) {
  const { active, accountId, targetId, onError } = args;
  const [memberships, setMemberships] = useState<GroupMembershipCurrentRow[]>(
    []
  );
  const [guildSpaces, setGuildSpaces] = useState<GuildSpace[]>([]);
  const [guildName, setGuildName] = useState('');
  const [spaceId, setSpaceId] = useState('general');
  const [guildLoading, setGuildLoading] = useState(false);

  const resetGuildState = useCallback(() => {
    setGuildSpaces([]);
    setGuildName('');
    setSpaceId('general');
    setGuildLoading(false);
  }, []);

  useEffect(() => {
    if (!active || !accountId) {
      setMemberships([]);
      return;
    }
    let cancelled = false;
    const client = createReadOnlyOnSocialClient();
    void client.query.groups
      .membershipsBy(accountId, { limit: 24 })
      .then((page) => {
        if (!cancelled) setMemberships(page.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setMemberships([]);
      });
    return () => {
      cancelled = true;
    };
  }, [active, accountId]);

  useEffect(() => {
    if (!active || targetId === COMPOSER_PERSONAL_TARGET) {
      setGuildSpaces([]);
      setGuildName('');
      setGuildLoading(false);
      return;
    }
    const membership = memberships.find((row) => row.groupId === targetId);
    if (!membership) {
      setGuildSpaces([]);
      setGuildName(targetId);
      setGuildLoading(true);
      return;
    }

    let cancelled = false;
    setGuildLoading(true);
    setGuildName(membership.groupName?.trim() || targetId);
    const client = createReadOnlyOnSocialClient();
    void (async () => {
      try {
        const raw = await client.groups.getConfig(targetId);
        if (cancelled) return;
        const access = accessFromMembership(membership);
        if (raw) {
          const config = normalizeGuildConfig(targetId, raw);
          const spaces = composerGuildSpaces(config.structure, access);
          setGuildName(config.name || membership.groupName || targetId);
          setGuildSpaces(spaces);
          const preferred =
            defaultComposerSpace(config.structure, access)?.id ??
            spaces[0]?.id ??
            'general';
          setSpaceId((current) =>
            spaces.some((space) => space.id === current) ? current : preferred
          );
        } else {
          setGuildName(membership.groupName?.trim() || targetId);
          setGuildSpaces([]);
        }
      } catch {
        if (!cancelled) {
          setGuildName(membership.groupName?.trim() || targetId);
          setGuildSpaces([]);
          onError?.('Could not load that guild’s rooms.');
        }
      } finally {
        if (!cancelled) setGuildLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, targetId, memberships, onError]);

  const feedTargetOptions = useMemo(() => {
    const options = [{ id: COMPOSER_PERSONAL_TARGET, label: 'Public' }];
    for (const row of memberships) {
      const id = row.groupId?.trim();
      if (!id) continue;
      options.push({
        id,
        label: row.groupName?.trim() || id,
      });
    }
    return options;
  }, [memberships]);

  const selectedSpace: GuildSpace | null = useMemo(() => {
    if (targetId === COMPOSER_PERSONAL_TARGET || guildSpaces.length === 0) {
      return null;
    }
    return (
      guildSpaces.find((space) => space.id === spaceId) ?? guildSpaces[0] ?? null
    );
  }, [targetId, guildSpaces, spaceId]);

  const destination =
    targetId !== COMPOSER_PERSONAL_TARGET
      ? {
          kind: 'guild' as const,
          groupId: targetId,
          name: guildName || targetId,
          channels: guildSpaces.map((space) => ({
            id: space.id,
            title: space.title,
          })),
          selectedChannelId: selectedSpace?.id ?? spaceId,
          onChannelChange: setSpaceId,
          loading:
            guildLoading ||
            !memberships.some((row) => row.groupId === targetId),
        }
      : {
          kind: 'personal' as const,
        };

  return {
    memberships,
    feedTargetOptions,
    destination,
    selectedSpace,
    guildLoading,
    spaceId,
    setSpaceId,
    resetGuildState,
  };
}
