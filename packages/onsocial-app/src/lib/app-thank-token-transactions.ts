import type { ConnectorAction } from '@hot-labs/near-connect';
import { ACTIVE_NEAR_NETWORK } from '@/lib/app-config';
import type { SigningWallet } from '@/lib/app-create-token-transactions';
import { extractNearTransactionHashes } from '@/lib/app-near-rpc';
import {
  THANK_TOKEN_MEMO,
  THANK_TOKEN_RECIPIENT_CAP,
  getThankRecipientError,
} from '@/lib/app-thank-token';

const FT_TRANSFER_GAS = '15000000000000';
const FT_STORAGE_GAS = '10000000000000';

export interface ThankTokenRecipientPlan {
  accountId: string;
  needsStorage: boolean;
}

export interface BuildThankTokenActionsParams {
  recipients: ThankTokenRecipientPlan[];
  amountSmallest: string;
  storageDepositYocto: string;
  senderId: string;
}

/** Per person: register if needed, then transfer. First people complete if the batch stops. */
export function buildThankTokenActions(
  params: BuildThankTokenActionsParams
): ConnectorAction[] {
  const recipientError = getThankRecipientError(
    params.recipients.map((row) => row.accountId),
    params.senderId
  );
  if (recipientError) {
    throw new Error(recipientError);
  }
  if (!params.amountSmallest || params.amountSmallest === '0') {
    throw new Error('Enter an amount greater than zero.');
  }
  if (params.recipients.length > THANK_TOKEN_RECIPIENT_CAP) {
    throw new Error(
      `Thank up to ${THANK_TOKEN_RECIPIENT_CAP} people at a time.`
    );
  }

  const actions: ConnectorAction[] = [];
  for (const recipient of params.recipients) {
    if (recipient.needsStorage) {
      actions.push({
        type: 'FunctionCall',
        params: {
          methodName: 'storage_deposit',
          args: {
            account_id: recipient.accountId,
            registration_only: true,
          },
          gas: FT_STORAGE_GAS,
          deposit: params.storageDepositYocto,
        },
      });
    }
    actions.push({
      type: 'FunctionCall',
      params: {
        methodName: 'ft_transfer',
        args: {
          receiver_id: recipient.accountId,
          amount: params.amountSmallest,
          memo: THANK_TOKEN_MEMO,
        },
        gas: FT_TRANSFER_GAS,
        deposit: '1',
      },
    });
  }
  return actions;
}

export async function sendThankTokenTransaction(
  getSigningWallet: () => Promise<SigningWallet>,
  contractId: string,
  params: BuildThankTokenActionsParams
): Promise<string[]> {
  const actions = buildThankTokenActions(params);
  const { wallet, accountId: signerId } = await getSigningWallet();
  const result = await wallet.signAndSendTransaction({
    network: ACTIVE_NEAR_NETWORK,
    signerId,
    receiverId: contractId,
    actions,
  });
  return extractNearTransactionHashes(result);
}
