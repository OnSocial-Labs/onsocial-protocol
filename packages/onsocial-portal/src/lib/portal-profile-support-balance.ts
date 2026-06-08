import { createPortalServerOnSocialClient } from '@/lib/onsocial-server-client';
import { normalizeFtBalanceYocto, viewContractAt } from '@/lib/near-rpc';

type PortalOnSocial = ReturnType<typeof createPortalServerOnSocialClient>;

export interface PortalProfileSupportBalance {
  balanceYocto: string;
}

function resolveSocialSpendContractId(
  os: PortalOnSocial = createPortalServerOnSocialClient()
): string {
  return os.socialSpend.contractId;
}

export async function loadPortalProfileSupportBalance(
  accountId: string,
  os: PortalOnSocial = createPortalServerOnSocialClient()
): Promise<PortalProfileSupportBalance> {
  const raw = await viewContractAt<unknown>(
    resolveSocialSpendContractId(os),
    'get_target_balance',
    { account_id: accountId }
  );

  return {
    balanceYocto: normalizeFtBalanceYocto(raw).toString(),
  };
}
