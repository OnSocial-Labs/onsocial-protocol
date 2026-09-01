import {
  resolvePostMedia,
  type OnSocial,
  type PostData,
} from '@onsocial/sdk';
import type { NearWalletBase } from '@hot-labs/near-connect';
import type { ComposerSubmit } from '@/features/guilds/guild-composer-sheet';
import { buildDaoPostProposalPayload } from '@/features/protocol/dao-post-proposal';
import { submitProtocolProposal } from '@/features/protocol/protocol-create';
import { postMetaFromText } from '@/features/home/post-mentions';
import { placesMetaFromComposer } from '@/lib/post-place';
import { resolveComposerAttach } from '@/features/guilds/composer-post-attach';
import { normalizeComposerContentLabels } from '@/lib/post-content-labels';
import {
  txToastGovError,
  txToastGovPending,
  txToastGovSuccess,
} from '@/lib/transaction-toast-copy';

type TrackTransaction = (input: {
  txHashes: string[];
  submittedMessage: string;
  successMessage: string;
  failureMessage: string;
}) => Promise<boolean>;

/**
 * Upload media (as the wallet), then `add_proposal` so the DAO publishes
 * after council approve — not an instant personal `set`.
 */
export async function submitDaoPostProposal(args: {
  client: OnSocial;
  daoAccountId: string;
  daoLabel: string;
  accountId: string;
  wallet: NearWalletBase;
  payload: ComposerSubmit;
  trackTransaction: TrackTransaction;
}): Promise<{ confirmed: boolean; postId: string | null }> {
  const { client, daoAccountId, daoLabel, accountId, wallet, payload } = args;
  const text = payload.text.trim();
  const files = payload.files ?? [];
  const attach = resolveComposerAttach({
    text,
    poll: payload.poll,
    drop: payload.drop,
    proposal: payload.proposal,
  });
  if (!text && !files.length && !attach.hasAttach) {
    return { confirmed: false, postId: null };
  }

  const bodyText = attach.bodyText;
  const contentLabels = normalizeComposerContentLabels(payload);
  const tags = {
    ...postMetaFromText(bodyText),
    ...placesMetaFromComposer(payload.places),
  };
  const now = Date.now();
  const postId = now.toString();

  const draft: PostData = {
    text: bodyText,
    timestamp: now,
    ...tags,
    ...attach.writeFields,
    ...contentLabels,
    ...(files.length ? { files } : {}),
  };

  const resolved = await resolvePostMedia(draft, {
    upload: async (file) => {
      const uploaded = await client.storage.upload(file);
      return {
        cid: uploaded.cid,
        mime: uploaded.mime,
        size: uploaded.size,
      };
    },
    uploadJson: async (data) => {
      const uploaded = await client.storage.uploadJson(data);
      return {
        cid: uploaded.cid,
        mime: uploaded.mime,
        size: uploaded.size,
      };
    },
    url: (cid) => client.storage.url(cid),
  });
  const proposalPayload = buildDaoPostProposalPayload({
    post: resolved,
    postId,
    daoLabel,
    now,
  });

  const response = await submitProtocolProposal({
    daoAccountId,
    accountId,
    wallet,
    payload: proposalPayload,
  });

  const confirmed = await args.trackTransaction({
    txHashes: response.txHashes,
    submittedMessage: txToastGovPending.actionSubmitted('DAO post'),
    successMessage:
      txToastGovSuccess.actionConfirmed('DAO post proposal') +
      ' Approve to publish.',
    failureMessage: txToastGovError.actionFailed('DAO post proposal'),
  });

  return { confirmed, postId: confirmed ? postId : null };
}
