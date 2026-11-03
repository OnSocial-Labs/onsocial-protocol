import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GUILD_STRUCTURE,
  appendCustomGuildSpace,
  canPostToGuildSpace,
  canViewerPostInChannel,
  enabledGuildSpaces,
  parseGuildStructure,
  postPolicyHint,
  postPolicyLabel,
  guildStructuresEqual,
} from '@/features/guilds/guild-structure';

describe('guild-structure', () => {
  it('defaults to general-only when structure is missing', () => {
    const structure = parseGuildStructure({ name: 'Test guild' });
    expect(structure.defaultSpaceId).toBe('general');
    expect(enabledGuildSpaces(structure).map((space) => space.id)).toEqual([
      'general',
    ]);
  });

  it('parses persisted structure from x.onsocial.structure', () => {
    const structure = parseGuildStructure({
      name: 'Test guild',
      x: {
        onsocial: {
          structure: {
            v: 1,
            defaultSpaceId: 'general',
            spaces: [
              {
                id: 'general',
                title: 'General',
                kind: 'discussion',
                enabled: true,
                order: 0,
                audience: 'members',
                postPolicy: 'members',
              },
              {
                id: 'announcements',
                title: 'Announcements',
                kind: 'announcement',
                enabled: true,
                order: 1,
                audience: 'public',
                postPolicy: 'moderators',
              },
            ],
          },
        },
      },
    });

    expect(enabledGuildSpaces(structure).map((space) => space.id)).toEqual([
      'general',
      'announcements',
    ]);
  });

  it('compares structures for dirty detection', () => {
    const a = DEFAULT_GUILD_STRUCTURE;
    const b = structuredClone(DEFAULT_GUILD_STRUCTURE);
    expect(guildStructuresEqual(a, b)).toBe(true);
    b.spaces[0]!.title = 'Lobby';
    expect(guildStructuresEqual(a, b)).toBe(false);
  });

  it('labels post policies with social surface and role hints', () => {
    expect(postPolicyLabel('members')).toBe('Everyone here');
    expect(postPolicyHint('members')).toBe('Any member can share');
    expect(postPolicyLabel('moderators')).toBe('From the team');
    expect(postPolicyHint('moderators')).toBe('Mod · admin · owner');
    expect(postPolicyLabel('admins')).toBe('Leaders only');
    expect(postPolicyHint('admins')).toBe('admin · owner');
    expect(postPolicyLabel('allowlist')).toBe('Selected members');
    expect(postPolicyHint('allowlist')).toBe('Chosen members · admin · owner');
  });

  it('escalates staff access for restricted spaces', () => {
    const structure = parseGuildStructure({
      name: 'Guild',
      x: {
        onsocial: {
          structure: {
            v: 1,
            defaultSpaceId: 'general',
            spaces: [
              {
                id: 'announcements',
                title: 'Announcements',
                kind: 'announcement',
                enabled: true,
                order: 0,
                audience: 'public',
                postPolicy: 'moderators',
              },
            ],
          },
        },
      },
    });
    const member = {
      isMember: true,
      canModerate: false,
      isAdmin: false,
      isOwner: false,
    };
    const moderator = { ...member, canModerate: true };
    const admin = { ...member, isAdmin: true };

    expect(canViewerPostInChannel(structure, 'announcements', member)).toBe(
      false
    );
    expect(canViewerPostInChannel(structure, 'announcements', moderator)).toBe(
      true
    );
    expect(canViewerPostInChannel(structure, 'announcements', admin)).toBe(true);
    expect(
      canPostToGuildSpace(structure.spaces[0]!, { ...member, isOwner: true })
    ).toBe(true);
  });

  it('gates allowlist rooms by space write grants', () => {
    const structure = parseGuildStructure({
      name: 'Guild',
      x: {
        onsocial: {
          structure: {
            v: 1,
            defaultSpaceId: 'general',
            spaces: [
              {
                id: 'shipping-room',
                title: 'Shipping',
                kind: 'discussion',
                enabled: true,
                order: 0,
                audience: 'members',
                postPolicy: 'allowlist',
              },
            ],
          },
        },
      },
    });
    const member = {
      isMember: true,
      canModerate: false,
      isAdmin: false,
      isOwner: false,
    };
    const moderator = { ...member, canModerate: true };
    const admin = { ...member, isAdmin: true };

    expect(canViewerPostInChannel(structure, 'shipping-room', member)).toBe(
      false
    );
    expect(canViewerPostInChannel(structure, 'shipping-room', moderator)).toBe(
      false
    );
    expect(canViewerPostInChannel(structure, 'shipping-room', admin)).toBe(true);
    expect(
      canViewerPostInChannel(structure, 'shipping-room', {
        ...member,
        canWriteSpaceIds: new Set(['shipping-room']),
      })
    ).toBe(true);
    expect(
      canPostToGuildSpace(structure.spaces[0]!, { ...member, isOwner: true })
    ).toBe(true);
  });

  it('appends a custom room onto the draft', () => {
    const structure = DEFAULT_GUILD_STRUCTURE;
    const added = appendCustomGuildSpace(structure, {
      title: 'Shipping Room',
      postPolicy: 'admins',
      enabled: true,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const room = added.structure.spaces.find(
      (space) => space.id === 'shipping-room'
    );
    expect(room).toMatchObject({
      title: 'Shipping Room',
      postPolicy: 'admins',
      enabled: true,
      kind: 'discussion',
      order: structure.spaces.length,
    });

    const hidden = appendCustomGuildSpace(added.structure, {
      title: 'Notes',
      postPolicy: 'members',
      enabled: false,
    });
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(
      hidden.structure.spaces.find((space) => space.id === 'notes')?.enabled
    ).toBe(false);

    expect(
      appendCustomGuildSpace(hidden.structure, {
        title: 'Shipping Room',
        postPolicy: 'members',
        enabled: true,
      })
    ).toEqual({
      ok: false,
      error: 'A room with this name already exists.',
    });
    expect(
      appendCustomGuildSpace(structure, {
        title: '   ',
        postPolicy: 'members',
        enabled: true,
      })
    ).toEqual({ ok: false, error: 'Enter a room name.' });
  });
});
