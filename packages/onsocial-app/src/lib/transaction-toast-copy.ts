export const TX_TOAST_EYEBROW = {
  wallet: 'Wallet',
  confirming: 'Confirming',
} as const;

export const txToastPending = {
  collectingSocial: 'Collecting SOCIAL…',
  addingStorage: 'Adding storage…',
  withdrawingStorage: 'Withdrawing storage…',
  fundingSharePool: 'Funding share pool…',
  sharingStorage: 'Sharing storage…',
} as const;

export const txToastSuccess = {
  socialCollected: 'SOCIAL collected.',
  storageAdded: 'Storage added.',
  storageWithdrawn: 'Storage withdrawn to wallet.',
  sharePoolFunded: 'Share pool funded.',
  storageShared: 'Storage shared.',
} as const;

export const txToastError = {
  collectSocialFailed: 'Could not collect SOCIAL.',
  storageDepositFailed: 'Could not add storage.',
  storageWithdrawFailed: 'Could not withdraw storage.',
  sharePoolFundFailed: 'Could not fund share pool.',
  storageShareFailed: 'Could not share storage.',
} as const;
