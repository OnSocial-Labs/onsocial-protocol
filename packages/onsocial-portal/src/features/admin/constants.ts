export const ADMIN_WALLETS = (
  process.env.NEXT_PUBLIC_ADMIN_WALLETS ??
  'onsocial.near,onsocial.testnet,greenghost.near,test01greenghost.testnet'
)
  .split(',')
  .map((wallet) => wallet.trim().toLowerCase());

export const CONTRACT_OWNER_WALLETS = ['onsocial.testnet', 'onsocial.near'];

export const RELAYER_ACCOUNT =
  process.env.NEXT_PUBLIC_NEAR_NETWORK === 'mainnet'
    ? 'relayer.onsocial.near'
    : 'relayer.onsocial.testnet';