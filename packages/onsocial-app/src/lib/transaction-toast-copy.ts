export const TX_TOAST_EYEBROW = {
  wallet: 'Wallet',
  confirming: 'Confirming',
} as const;

export const txToastPending = {
  collectingSocial: 'Collecting SOCIAL…',
  addingStorage: 'Adding storage…',
  withdrawingStorage: 'Withdrawing storage…',
} as const;

export const txToastSuccess = {
  socialCollected: 'SOCIAL collected.',
  storageAdded: 'Storage added.',
  storageWithdrawn: 'Storage withdrawn to wallet.',
} as const;

export const txToastError = {
  collectSocialFailed: 'Could not collect SOCIAL.',
  storageDepositFailed: 'Could not add storage.',
  storageWithdrawFailed: 'Could not withdraw storage.',
} as const;
