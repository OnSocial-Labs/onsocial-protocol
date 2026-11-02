import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { createRequestOnSocialClient } from '@/lib/portal-request-client';
import { normalizeFtBalanceYocto, viewContractAt } from '@/lib/near-rpc';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

export interface PortalProfileSupportBalance {
  balanceYocto: string;
}

function resolveSocialSpendContractId(os: PortalOnSocial): string {
  return os.socialSpend.contractId;
}

export async function loadPortalProfileSupportBalance(
  accountId: string,
  os?: PortalOnSocial
): Promise<PortalProfileSupportBalance> {
  const client = os ?? (await createRequestOnSocialClient());
  const raw = await viewContractAt<unknown>(
    resolveSocialSpendContractId(client),
    'get_target_balance',
    { account_id: accountId }
  );

  return {
    balanceYocto: normalizeFtBalanceYocto(raw).toString(),
  };
}
