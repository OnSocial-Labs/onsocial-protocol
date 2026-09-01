import { describe, expect, it } from 'vitest';
import {
  guildAttachWriteFields,
  resolveComposerAttach,
} from '@/features/guilds/composer-post-attach';

describe('resolveComposerAttach', () => {
  it('prefers a Drop over a proposal when both are present', () => {
    const attach = resolveComposerAttach({
      text: '',
      drop: {
        collectionId: 'drop-1',
        title: 'Night',
        mediumKind: 'audio',
      },
      proposal: {
        groupId: 'builders.near',
        proposalId: '12',
        title: 'Invite alice.near',
      },
    });
    expect(attach.commerceEmbed).toMatchObject({ kind: 'collection' });
    expect(attach.proposalEmbed).toBeNull();
    expect(attach.bodyText).toBe('Night');
  });

  it('builds a proposal embed and snapshot when tagging only a proposal', () => {
    const attach = resolveComposerAttach({
      text: '',
      proposal: {
        groupId: 'builders.near',
        proposalId: '12',
        title: 'Invite alice.near',
        kind: 'Role',
        groupName: 'Builders',
      },
    });
    expect(attach.writeFields).toMatchObject({
      embeds: [
        {
          kind: 'proposal',
          groupId: 'builders.near',
          proposalId: '12',
        },
      ],
      x: {
        onsocial: {
          proposal: expect.objectContaining({
            title: 'Invite alice.near',
            groupName: 'Builders',
          }),
        },
      },
    });
    expect(attach.bodyText).toBe('Invite alice.near');
    expect(attach.hasAttach).toBe(true);
  });

  it('keeps a caption when the user wrote one', () => {
    const attach = resolveComposerAttach({
      text: '  please vote  ',
      proposal: {
        groupId: 'builders.near',
        proposalId: '12',
        title: 'Invite alice.near',
      },
    });
    expect(attach.bodyText).toBe('please vote');
  });

  it('keeps attach kind on guild writes and fills room kind otherwise', () => {
    const drop = resolveComposerAttach({
      text: '',
      drop: {
        collectionId: 'drop-1',
        title: 'Night',
        mediumKind: 'audio',
      },
    });
    expect(guildAttachWriteFields(drop, 'discussion').kind).toBe('audio');

    const proposal = resolveComposerAttach({
      text: '',
      proposal: {
        groupId: 'builders.near',
        proposalId: '12',
        title: 'Invite alice.near',
      },
    });
    expect(guildAttachWriteFields(proposal, 'discussion').kind).toBe(
      'discussion'
    );
    expect(proposal.valueFields).toMatchObject({
      embeds: [{ kind: 'proposal', proposalId: '12' }],
    });
    expect(proposal.writeFields.kind).toBeUndefined();
  });
});
