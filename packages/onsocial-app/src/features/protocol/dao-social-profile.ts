import { buildProfileAction } from '@onsocial/sdk/advanced';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import { CORE_CONTRACT } from '@/lib/app-near-contract';
import { nearToYocto } from '@/lib/app-near-rpc';

/** Gas for core `execute` profile set from a DAO Call proposal. */
export const DAO_SOCIAL_PROFILE_CALL_GAS = '100000000000000';

/**
 * Attached NEAR on the Call action so the DAO can fund core storage for
 * profile keys (new DAOs start with no social balance).
 */
export const DAO_SOCIAL_PROFILE_STORAGE_DEPOSIT_NEAR = '0.05';

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

export type DaoSocialProfileDraft = {
  name: string;
  bio?: string;
  avatar?: string | null;
  banner?: string | null;
  links?: Record<string, string> | null;
};

/**
 * Build an `add_proposal` Call that writes OnSocial `{dao}/profile/*`
 * (predecessor = DAO). Approve + finalize still required after submit.
 */
export function buildDaoSocialProfileProposalPayload(
  draft: DaoSocialProfileDraft
): ProtocolProposalPayload {
  const name = draft.name.trim();
  if (!name) {
    throw new Error('Profile needs a name.');
  }

  const profile: {
    name: string;
    kind: 'dao';
    bio?: string;
    avatar?: string;
    banner?: string;
    links?: Record<string, string>;
  } = { name, kind: 'dao' };

  const bio = draft.bio?.trim();
  if (bio) profile.bio = bio;

  const avatar = draft.avatar?.trim();
  if (avatar) profile.avatar = avatar;

  const banner = draft.banner?.trim();
  if (banner) profile.banner = banner;

  if (draft.links && Object.keys(draft.links).length > 0) {
    profile.links = draft.links;
  }

  const action = buildProfileAction(profile);

  return {
    proposal: {
      description: `Publish OnSocial profile for ${name}.`,
      kind: {
        FunctionCall: {
          receiver_id: CORE_CONTRACT,
          actions: [
            {
              method_name: 'execute',
              args: encodeJsonArgs({
                request: { action },
              }),
              deposit: nearToYocto(DAO_SOCIAL_PROFILE_STORAGE_DEPOSIT_NEAR),
              gas: DAO_SOCIAL_PROFILE_CALL_GAS,
            },
          ],
        },
      },
    },
  };
}
