import {
  buildProtocolSeasonConfigInput,
  type ProtocolSeasonConfigDraft,
} from '@/features/protocol/protocol-season-config';
import {
  ACTIVE_NEAR_NETWORK,
  BOOST_CONTRACT,
  SOCIAL_SPEND_CONTRACT,
  SOCIAL_TOKEN_CONTRACT,
  TREASURY_DAO_ACCOUNT,
} from '@/lib/app-config';
import { APP_REWARDS_CONTRACT } from '@/lib/app-rewards-chain';
import { yoctoToSocial } from '@/lib/format-social-balance';
import type { ProtocolProposalPayload } from '@/features/protocol/protocol-create';

const SCARCES_CONTRACT =
  ACTIVE_NEAR_NETWORK === 'mainnet'
    ? 'scarces.onsocial.near'
    : 'scarces.onsocial.testnet';

const SOCIAL_SPEND_GAS = 100_000_000_000_000;
const BOOST_WITHDRAW_GAS = 150_000_000_000_000;
const CONTRACT_UPGRADE_GAS = 250_000_000_000_000;
const NEAR_PUBLISHED_CODE_HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;

function encodeArgs(args: Record<string, string>): string {
  return btoa(JSON.stringify(args));
}

function encodeJsonArgs(args: unknown): string {
  return btoa(JSON.stringify(args));
}

export interface ProtocolManagedContract {
  contractId: string;
  label: string;
  transferMethod: string;
  transferArgField: 'new_owner' | 'owner_id';
  gas: number;
  deposit: string;
  upgradable: boolean;
}

export const PROTOCOL_MANAGED_CONTRACTS: ProtocolManagedContract[] = [
  {
    contractId: APP_REWARDS_CONTRACT,
    label: 'Rewards',
    transferMethod: 'transfer_ownership',
    transferArgField: 'new_owner',
    gas: 300_000_000_000_000,
    deposit: '0',
    upgradable: true,
  },
  {
    contractId: BOOST_CONTRACT,
    label: 'Boost',
    transferMethod: 'set_owner',
    transferArgField: 'new_owner',
    gas: 100_000_000_000_000,
    deposit: '1',
    upgradable: true,
  },
  {
    contractId: SCARCES_CONTRACT,
    label: 'Scarces',
    transferMethod: 'transfer_ownership',
    transferArgField: 'new_owner',
    gas: 100_000_000_000_000,
    deposit: '1',
    upgradable: true,
  },
  {
    contractId: SOCIAL_TOKEN_CONTRACT,
    label: 'Token',
    transferMethod: 'set_owner',
    transferArgField: 'new_owner',
    gas: 100_000_000_000_000,
    deposit: '0',
    upgradable: false,
  },
  {
    contractId: SOCIAL_SPEND_CONTRACT,
    label: 'Social spend',
    transferMethod: 'set_owner',
    transferArgField: 'owner_id',
    gas: 100_000_000_000_000,
    deposit: '1',
    upgradable: true,
  },
];

export function getProtocolUpgradableContracts(): ProtocolManagedContract[] {
  return PROTOCOL_MANAGED_CONTRACTS.filter((entry) => entry.upgradable);
}

export function findProtocolManagedContract(
  contractId: string
): ProtocolManagedContract | null {
  const id = contractId.trim().toLowerCase();
  return (
    PROTOCOL_MANAGED_CONTRACTS.find(
      (entry) => entry.contractId.toLowerCase() === id
    ) ?? null
  );
}

export type ProtocolContractConfigOpId =
  | 'join_rally'
  | 'support_profile'
  | 'support_endorsement'
  | 'boost_post'
  | 'unlock_page_mood';

export const PROTOCOL_CONTRACT_CONFIG_OPS: Array<{
  id: ProtocolContractConfigOpId;
  label: string;
  actionId: string;
  defaults: {
    label: string;
    minAmountYocto: string;
    treasuryBps: number;
    seasonPoolBps: number;
    targetBps: number;
    burnBps: number;
    seasonRequired: boolean;
    allowSelfTarget: boolean;
    targetTypes: string[];
  };
}> = [
  {
    id: 'join_rally',
    label: 'Join rally routing',
    actionId: 'join_rally',
    defaults: {
      label: 'Join Rally',
      minAmountYocto: '100000000000000000000',
      treasuryBps: 500,
      seasonPoolBps: 9_500,
      targetBps: 0,
      burnBps: 0,
      seasonRequired: true,
      allowSelfTarget: true,
      targetTypes: ['rally'],
    },
  },
  {
    id: 'support_profile',
    label: 'Support profile routing',
    actionId: 'support_profile',
    defaults: {
      label: 'Support Profile',
      minAmountYocto: '10000000000000000',
      treasuryBps: 100,
      seasonPoolBps: 0,
      targetBps: 9_900,
      burnBps: 0,
      seasonRequired: false,
      allowSelfTarget: false,
      targetTypes: ['profile'],
    },
  },
  {
    id: 'support_endorsement',
    label: 'Support endorsement routing',
    actionId: 'support_endorsement',
    defaults: {
      label: 'Support Endorsement',
      minAmountYocto: '10000000000000000',
      treasuryBps: 100,
      seasonPoolBps: 0,
      targetBps: 9_900,
      burnBps: 0,
      seasonRequired: false,
      allowSelfTarget: false,
      targetTypes: ['endorsement'],
    },
  },
  {
    id: 'boost_post',
    label: 'Boost post routing',
    actionId: 'boost_post',
    defaults: {
      label: 'Boost Post',
      minAmountYocto: '10000000000000000',
      treasuryBps: 1_000,
      seasonPoolBps: 0,
      targetBps: 9_000,
      burnBps: 0,
      seasonRequired: false,
      allowSelfTarget: true,
      targetTypes: ['post'],
    },
  },
  {
    id: 'unlock_page_mood',
    label: 'Unlock page mood routing',
    actionId: 'unlock_page_mood',
    defaults: {
      label: 'Unlock Page Mood',
      minAmountYocto: '100000000000000000000',
      treasuryBps: 10_000,
      seasonPoolBps: 0,
      targetBps: 0,
      burnBps: 0,
      seasonRequired: false,
      allowSelfTarget: true,
      targetTypes: ['page_mood'],
    },
  },
];

export function normalizePublishedCodeHash(input: string): string {
  const trimmed = input.trim();
  if (!NEAR_PUBLISHED_CODE_HASH_PATTERN.test(trimmed)) {
    throw new Error('Enter a valid published global code hash.');
  }
  return trimmed;
}

export function buildProtocolOwnershipPayload(opts: {
  contractId: string;
  newOwnerId: string;
  description?: string;
}): ProtocolProposalPayload {
  const contract = findProtocolManagedContract(opts.contractId);
  if (!contract) throw new Error('Choose a managed contract.');
  const newOwnerId = opts.newOwnerId.trim();
  if (!newOwnerId) throw new Error('New owner account is required.');
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Transfer ${contract.label} ownership to ${newOwnerId}.`,
      kind: {
        FunctionCall: {
          receiver_id: contract.contractId,
          actions: [
            {
              method_name: contract.transferMethod,
              args: encodeArgs({
                [contract.transferArgField]: newOwnerId,
              }),
              deposit: contract.deposit,
              gas: contract.gas,
            },
          ],
        },
      },
    },
  };
}

export function buildProtocolUpgradePayload(opts: {
  contractId: string;
  codeHash: string;
  description?: string;
}): ProtocolProposalPayload {
  const contract = findProtocolManagedContract(opts.contractId);
  if (!contract?.upgradable) {
    throw new Error('Choose a hash-upgradable contract.');
  }
  const codeHash = normalizePublishedCodeHash(opts.codeHash);
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Upgrade ${contract.label} by published code hash.`,
      kind: {
        FunctionCall: {
          receiver_id: contract.contractId,
          actions: [
            {
              method_name: 'update_contract_from_hash',
              args: encodeArgs({ code_hash: codeHash }),
              deposit: '0',
              gas: CONTRACT_UPGRADE_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildProtocolContractConfigPayload(opts: {
  operationId: ProtocolContractConfigOpId;
  treasuryBps: number;
  seasonPoolBps: number;
  targetBps: number;
  burnBps: number;
  minAmountYocto: string;
  description?: string;
}): ProtocolProposalPayload {
  const operation = PROTOCOL_CONTRACT_CONFIG_OPS.find(
    (entry) => entry.id === opts.operationId
  );
  if (!operation) throw new Error('Choose a contract setting.');
  const sum =
    opts.treasuryBps + opts.seasonPoolBps + opts.targetBps + opts.burnBps;
  if (sum !== 10_000) {
    throw new Error('Routing shares must sum to 100% (10,000 bps).');
  }
  const defaults = operation.defaults;
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Configure social-spend ${operation.label.toLowerCase()}.`,
      kind: {
        FunctionCall: {
          receiver_id: SOCIAL_SPEND_CONTRACT,
          actions: [
            {
              method_name: 'set_action_config',
              args: encodeJsonArgs({
                action_id: operation.actionId,
                config: {
                  label: defaults.label,
                  active: true,
                  min_amount: opts.minAmountYocto || defaults.minAmountYocto,
                  target_types: defaults.targetTypes,
                  treasury_bps: opts.treasuryBps,
                  season_pool_bps: opts.seasonPoolBps,
                  target_bps: opts.targetBps,
                  burn_bps: opts.burnBps,
                  season_required: defaults.seasonRequired,
                  allow_self_target: defaults.allowSelfTarget,
                },
              }),
              deposit: '1',
              gas: SOCIAL_SPEND_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildProtocolSeasonConfigPayload(
  opts: ProtocolSeasonConfigDraft & {
    description?: string;
  }
): ProtocolProposalPayload {
  const input = buildProtocolSeasonConfigInput(opts);

  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Configure ${input.season_id} rally season.`,
      kind: {
        FunctionCall: {
          receiver_id: SOCIAL_SPEND_CONTRACT,
          actions: [
            {
              method_name: 'set_season_config',
              args: encodeJsonArgs(input),
              deposit: '1',
              gas: SOCIAL_SPEND_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildProtocolFundSeasonPayload(opts: {
  seasonId: string;
  amountYocto: string;
  description?: string;
}): ProtocolProposalPayload {
  const seasonId = opts.seasonId.trim().toLowerCase();
  if (!seasonId) throw new Error('Season is required.');
  const amountYocto = opts.amountYocto.trim();
  if (!/^\d+$/.test(amountYocto) || amountYocto === '0') {
    throw new Error('Enter a valid SOCIAL amount to fund.');
  }
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Fund ${seasonId} rally pool with ${yoctoToSocial(amountYocto)} SOCIAL.`,
      kind: {
        FunctionCall: {
          receiver_id: SOCIAL_TOKEN_CONTRACT,
          actions: [
            {
              method_name: 'ft_transfer_call',
              args: encodeArgs({
                receiver_id: SOCIAL_SPEND_CONTRACT,
                amount: amountYocto,
                msg: JSON.stringify({
                  v: 1,
                  action: 'fund_season_pool',
                  season_id: seasonId,
                }),
              }),
              deposit: '1',
              gas: SOCIAL_SPEND_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildProtocolWithdrawBoostInfraPayload(opts: {
  amountYocto: string;
  receiverId?: string;
  description?: string;
}): ProtocolProposalPayload {
  const amountYocto = opts.amountYocto.trim();
  if (!/^\d+$/.test(amountYocto) || amountYocto === '0') {
    throw new Error('Enter a valid SOCIAL amount to withdraw.');
  }
  const receiverId = (opts.receiverId ?? TREASURY_DAO_ACCOUNT).trim();
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Withdraw ${yoctoToSocial(amountYocto)} SOCIAL from boost infra to ${receiverId}.`,
      kind: {
        FunctionCall: {
          receiver_id: BOOST_CONTRACT,
          actions: [
            {
              method_name: 'withdraw_infra',
              args: encodeArgs({
                amount: amountYocto,
                receiver_id: receiverId,
              }),
              deposit: '1',
              gas: BOOST_WITHDRAW_GAS,
            },
          ],
        },
      },
    },
  };
}

export function buildProtocolSetBoostInfraAuthorityPayload(opts: {
  authorityId?: string;
  description?: string;
}): ProtocolProposalPayload {
  const authorityId = (opts.authorityId ?? TREASURY_DAO_ACCOUNT).trim();
  if (!authorityId) throw new Error('Authority account is required.');
  return {
    proposal: {
      description:
        opts.description?.trim() ||
        `Delegate boost infra withdrawals to ${authorityId}.`,
      kind: {
        FunctionCall: {
          receiver_id: BOOST_CONTRACT,
          actions: [
            {
              method_name: 'set_infra_withdraw_authority',
              args: encodeJsonArgs({ authority: authorityId }),
              deposit: '1',
              gas: SOCIAL_SPEND_GAS,
            },
          ],
        },
      },
    },
  };
}
