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
  const drop: ComposerDropDraft | null =
    input.drop && isDropComposeDraftReady(input.drop) ? input.drop : null;
  const proposal: ComposerProposalDraft | null =
    !drop && input.proposal && isProposalComposeDraftReady(input.proposal)
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
  const kind = poll ? ('poll' as const) : dropKind;
  const valueFields = {
    ...(embed ? { embeds: [embed] } : {}),
    ...(extra ? { x: extra } : {}),
  };

  return {
    bodyText,
    drop,
    proposal,
    pollEmbed: poll,
    commerceEmbed,
    proposalEmbed,
    extra,
    kind,
    hasAttach: Boolean(embed),
    valueFields,
    writeFields: {
      ...valueFields,
      ...(kind ? { kind } : {}),
    },
  };
}

/** Toolbar locks. Photo can sit next to a proposal tag; poll and Drop cannot. */
export function composerToolLocks(input: {
  mode: string;
  pollEnabled: boolean;
  hasDrop: boolean;
  hasProposal: boolean;
  mediaCount: number;
}) {
  const isPost = input.mode === 'post';
  return {
    canUsePoll: isPost && !input.hasDrop && !input.hasProposal,
    canUseMedia: !input.pollEnabled && !input.hasDrop,
    canUseDrop:
      isPost &&
      !input.pollEnabled &&
      !input.hasProposal &&
      input.mediaCount === 0,
    canUseProposal: isPost && !input.pollEnabled && !input.hasDrop,
  };
}

/** Guild writes keep room/media kind when the attach has none (text / proposal). */
export function guildAttachWriteFields(
  attach: ReturnType<typeof resolveComposerAttach>,
  fallbackKind: string | undefined
) {
  return {
    ...attach.writeFields,
    ...(!attach.writeFields.kind && fallbackKind
      ? { kind: fallbackKind }
      : {}),
  };
}
