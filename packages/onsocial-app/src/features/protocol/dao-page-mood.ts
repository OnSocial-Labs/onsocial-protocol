import {
  assertCanApplyPageMood,
  mergeMoodIntoPageConfig,
  PAGE_MOOD_CATALOG,
  pageMoodPresetForId,
  type PageConfig,
  type PageMoodId,
} from '@onsocial/sdk';
import { buildPageConfigAction } from '@onsocial/sdk/advanced';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';
import {
  DAO_SOCIAL_PROFILE_CALL_GAS,
  DAO_SOCIAL_PROFILE_STORAGE_DEPOSIT_NEAR,
} from '@/features/protocol/dao-social-profile';
import { CORE_CONTRACT } from '@/lib/app-near-contract';
import { nearToYocto } from '@/lib/app-near-rpc';

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
 * Build an `add_proposal` Call that writes `{dao}/page/main` mood config
 * (predecessor = DAO). Approve + finalize still required after submit.
 */
export function buildDaoPageMoodProposalPayload(opts: {
  moodId: PageMoodId;
  currentConfig: PageConfig;
  daoLabel?: string;
}): ProtocolProposalPayload {
  assertCanApplyPageMood(
    opts.currentConfig,
    opts.moodId,
    PAGE_MOOD_CATALOG,
    (id: string) => pageMoodPresetForId(id).label
  );
  const nextConfig = mergeMoodIntoPageConfig(opts.currentConfig, opts.moodId);
  const action = buildPageConfigAction(nextConfig as Record<string, unknown>);
  const label = opts.daoLabel?.trim() || 'DAO';

  return {
    proposal: {
      description: `Set page mood to ${opts.moodId} for ${label}.`,
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
