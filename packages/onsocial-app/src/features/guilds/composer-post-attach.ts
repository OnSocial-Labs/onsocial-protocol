import type {
  ComposerDropDraft,
  ComposerPollDraft,
  ComposerProposalDraft,
} from '@/features/guilds/guild-composer-sheet';
import { isDropComposeDraftReady } from '@/features/scarces/drop-compose-draft';
import {
  commerceEmbedFromDraft,
  dropPostKind,
  dropSnapshotExtra,
  resolvedDropPostText,
} from '@/features/scarces/drop-post-payload';
import {
  isProposalComposeDraftReady,
  proposalEmbedFromDraft,
  proposalSnapshotExtra,
  resolvedProposalPostText,
} from '@/features/guilds/proposal-post-payload';

export function resolveComposerAttach(input: {
  text: string;
  poll?: ComposerPollDraft | null;
  drop?: ComposerDropDraft | null;
  proposal?: ComposerProposalDraft | null;
}) {
  const drop = isDropComposeDraftReady(input.drop) ? input.drop : null;
  const proposal =
    !drop && isProposalComposeDraftReady(input.proposal)
      ? input.proposal
      : null;
  const poll =
    !drop && !proposal && input.poll
      ? {
          kind: 'poll' as const,
          question: input.text.trim(),
          options: input.poll.options,
          ...(input.poll.durationMs != null
            ? { closesAt: Date.now() + input.poll.durationMs }
            : {}),
        }
      : null;
  const commerceEmbed = drop ? commerceEmbedFromDraft(drop) : null;
  const proposalEmbed = proposal ? proposalEmbedFromDraft(proposal) : null;
  const dropKind = dropPostKind(drop);
  const bodyText = drop
    ? resolvedDropPostText(input.text, drop)
    : proposal
      ? resolvedProposalPostText(input.text, proposal)
      : input.text.trim();
  const extra = drop
    ? dropSnapshotExtra(drop)
    : proposal
      ? proposalSnapshotExtra(proposal)
      : undefined;
  const embed = poll ?? commerceEmbed ?? proposalEmbed ?? null;

  return {
    bodyText,
    drop,
    proposal,
    pollEmbed: poll,
    commerceEmbed,
    proposalEmbed,
    extra,
    kind: poll ? 'poll' : dropKind,
    hasAttach: Boolean(embed),
    writeFields: {
      ...(embed ? { embeds: [embed] } : {}),
      ...(extra ? { x: extra } : {}),
      ...(poll ? { kind: 'poll' as const } : dropKind ? { kind: dropKind } : {}),
    },
  };
}
