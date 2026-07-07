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
  creatingGuild: 'Creating guild…',
  joiningGuild: 'Joining guild…',
  requestingGuildAccess: 'Requesting access…',
  cancelingGuildRequest: 'Canceling request…',
  leavingGuild: 'Leaving guild…',
  postingToGuild: 'Posting to guild…',
  quotingGuildPost: 'Quoting…',
} as const;

export const txToastSuccess = {
  socialCollected: 'SOCIAL collected.',
  storageAdded: 'Storage added.',
  storageWithdrawn: 'Storage withdrawn to wallet.',
  sharePoolFunded: 'Share pool funded.',
  storageShared: 'Storage shared.',
  guildCreated: 'Guild created.',
  guildJoined: 'Guild joined.',
  guildAccessRequested: 'Access requested.',
  guildRequestCanceled: 'Request canceled.',
  guildLeft: 'Guild left.',
  guildPostPublished: 'Posted to guild.',
  guildQuotePublished: 'Quote posted.',
} as const;

export const txToastError = {
  collectSocialFailed: 'Could not collect SOCIAL.',
  storageDepositFailed: 'Could not add storage.',
  storageWithdrawFailed: 'Could not withdraw storage.',
  sharePoolFundFailed: 'Could not fund share pool.',
  storageShareFailed: 'Could not share storage.',
  guildCreateFailed: 'Could not create guild.',
  guildMembershipFailed: 'Could not update guild membership.',
  guildPostFailed: 'Could not post to guild.',
  guildQuoteFailed: 'Could not post quote.',
} as const;
