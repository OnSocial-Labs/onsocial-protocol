import type { ConnectorAction } from '@hot-labs/near-connect';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  FT_CREATE_FUND_NEAR,
  resolveFtTemplateIdentifier,
  type FtTemplateIdentifier,
} from '@/lib/app-ft-template-config';
import {
  extractNearTransactionHashes,
  nearToYocto,
} from '@/lib/app-near-rpc';

const FT_INIT_GAS = '100000000000000';
const FT_RENOUNCE_GAS = '30000000000000';

export interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

export interface CreateUserTokenParams {
  /** Full contract account id, e.g. `cool.alice.near`. */
  contractId: string;
  name: string;
  symbol: string;
  /** Smallest units (18 decimals). */
  totalSupply: string;
  icon: string;
  /** When true, call `renounce_owner` in the same batch. */
  renounceOwner?: boolean;
  /** NEAR attached to fund the new account (human). */
  fundNear?: string;
}

function buildUseGlobalContractAction(
  template: FtTemplateIdentifier
): ConnectorAction {
  if (template.kind === 'codeHash') {
    return {
      type: 'UseGlobalContract',
      params: {
        contractIdentifier: { codeHash: template.codeHash },
      },
    };
  }
  return {
    type: 'UseGlobalContract',
    params: {
      contractIdentifier: { accountId: template.accountId },
    },
  };
}

/** Batched create subaccount → global deploy → init → optional renounce. */
export async function sendCreateUserTokenTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  params: CreateUserTokenParams
): Promise<string[]> {
  const template = resolveFtTemplateIdentifier();
  if (!template) {
    throw new Error('Token template is not configured for this network.');
  }

  const fundNear = (params.fundNear ?? FT_CREATE_FUND_NEAR).trim() || FT_CREATE_FUND_NEAR;
  const deposit = nearToYocto(fundNear);
  if (!deposit || deposit === '0') {
    throw new Error('Fund amount must be greater than zero.');
  }

  const { wallet, accountId: signerId } = await getSigningWallet();
  const ownerId = signerId;

  const actions: ConnectorAction[] = [
    { type: 'CreateAccount' },
    {
      type: 'Transfer',
      params: { deposit },
    },
    buildUseGlobalContractAction(template),
    {
      type: 'FunctionCall',
      params: {
        methodName: 'new',
        args: {
          owner_id: ownerId,
          name: params.name,
          symbol: params.symbol,
          total_supply: params.totalSupply,
          icon: params.icon,
        },
        gas: FT_INIT_GAS,
        deposit: '0',
      },
    },
  ];

  if (params.renounceOwner) {
    actions.push({
      type: 'FunctionCall',
      params: {
        methodName: 'renounce_owner',
        args: {},
        gas: FT_RENOUNCE_GAS,
        deposit: '0',
      },
    });
  }

  // No AddKey — contract-only account (WASM locked without full-access keys).
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: params.contractId,
    actions,
  });

  return extractNearTransactionHashes(result);
}
