import type { ConnectorAction } from '@hot-labs/near-connect';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import {
  FT_CREATE_FUND_NEAR,
  resolveFtTemplateIdentifier,
} from '@/lib/app-ft-template-config';
import { extractNearTransactionHashes, nearToYocto } from '@/lib/app-near-rpc';
import { loadFtFactoryPublicKey } from '@/lib/ft-factory-client';

export interface SigningWallet {
  wallet: NearWalletBase;
  accountId: string;
}

export interface CreateUserTokenParams {
  /** Full contract account id, e.g. `cool.alice.near`. */
  contractId: string;
  /** NEAR attached to fund the new account (human). */
  fundNear?: string;
}

/**
 * Wallet half of creator-token create. Every wallet can sign these actions.
 * The server factory key installs the global contract and then deletes itself.
 */
export async function sendCreateUserTokenTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  params: CreateUserTokenParams
): Promise<string[]> {
  const template = resolveFtTemplateIdentifier();
  if (!template) {
    throw new Error(
      'Token template is not configured. Set NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH after publishing the global contract.'
    );
  }

  const fundNear =
    (params.fundNear ?? FT_CREATE_FUND_NEAR).trim() || FT_CREATE_FUND_NEAR;
  const deposit = nearToYocto(fundNear);
  if (!deposit || deposit === '0') {
    throw new Error('Fund amount must be greater than zero.');
  }

  const factoryPublicKey = await loadFtFactoryPublicKey();
  const { wallet, accountId: signerId } = await getSigningWallet();

  const actions: ConnectorAction[] = [
    { type: 'CreateAccount' },
    {
      type: 'Transfer',
      params: { deposit },
    },
    {
      type: 'AddKey',
      params: {
        publicKey: factoryPublicKey,
        accessKey: { permission: 'FullAccess' },
      },
    },
  ];

  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: params.contractId,
    actions,
  });

  return extractNearTransactionHashes(result);
}

const FT_ADMIN_GAS = '30000000000000';

async function sendTokenOwnerCall(
  getSigningWallet: () => Promise<SigningWallet>,
  contractId: string,
  methodName: string,
  args: Record<string, unknown>
): Promise<string[]> {
  const { wallet, accountId: signerId } = await getSigningWallet();
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: contractId,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName,
          args,
          gas: FT_ADMIN_GAS,
          deposit: '0',
        },
      },
    ],
  });
  return extractNearTransactionHashes(result);
}

export async function sendSetTokenIconTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  contractId: string,
  icon: string
): Promise<string[]> {
  return sendTokenOwnerCall(getSigningWallet, contractId, 'set_icon', { icon });
}

export async function sendRenounceTokenOwnerTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  contractId: string
): Promise<string[]> {
  return sendTokenOwnerCall(getSigningWallet, contractId, 'renounce_owner', {});
}
