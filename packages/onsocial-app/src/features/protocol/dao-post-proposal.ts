import { buildPostAction } from '@onsocial/sdk/advanced';
import type { PostData } from '@onsocial/sdk';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import {
  DAO_SOCIAL_PROFILE_CALL_GAS,
  DAO_SOCIAL_PROFILE_STORAGE_DEPOSIT_NEAR,
} from '@/features/protocol/dao-social-profile';
import { CORE_CONTRACT } from '@/lib/app-near-contract';
import { nearToYocto } from '@/lib/app-near-rpc';

/** Extra NEAR on the Call so the DAO can fund core storage for the post. */
export const DAO_POST_STORAGE_DEPOSIT_NEAR =
  DAO_SOCIAL_PROFILE_STORAGE_DEPOSIT_NEAR;

function encodeJsonArgs(args: unknown): string {
  const json = JSON.stringify(args);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf8').toString('base64');
  }
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Build an `add_proposal` Call that writes `{dao}/post/{postId}`
 * (predecessor = DAO). Approve + finalize still required after submit.
 */
export function buildDaoPostProposalPayload(opts: {
  post: PostData;
  postId: string;
  daoLabel?: string;
  now?: number;
}): ProtocolProposalPayload {
  const text = opts.post.text?.trim() ?? '';
  const hasMedia =
    Array.isArray(opts.post.media) && opts.post.media.length > 0;
  const hasEmbeds =
    Array.isArray(opts.post.embeds) && opts.post.embeds.length > 0;
  if (!text && !hasMedia && !hasEmbeds) {
    throw new Error('Post needs text or media.');
  }

  const action = buildPostAction(opts.post, opts.postId, opts.now);
  const label = opts.daoLabel?.trim() || 'DAO';
  const preview = text
    ? text.length > 72
      ? `${text.slice(0, 69)}…`
      : text
    : hasMedia
      ? 'media post'
      : 'post';

  return {
    proposal: {
      description: `Publish post for ${label}: ${preview}`,
      kind: {
        FunctionCall: {
          receiver_id: CORE_CONTRACT,
          actions: [
            {
              method_name: 'execute',
              args: encodeJsonArgs({
                request: { action },
              }),
              deposit: nearToYocto(DAO_POST_STORAGE_DEPOSIT_NEAR),
              gas: DAO_SOCIAL_PROFILE_CALL_GAS,
            },
          ],
        },
      },
    },
  };
}
