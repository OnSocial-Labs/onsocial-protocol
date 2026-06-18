/** Shared transaction toast voice — short, SOCIAL-forward, minimal. */

export const TX_TOAST_EYEBROW = {
  wallet: 'Wallet',
  confirming: 'Confirming',
} as const;

export const txToastPending = {
  collectingSocial: 'Collecting SOCIAL…',
  joiningRally: (seasonTitle: string) => `Joining ${seasonTitle}…`,
  sendingSupport: 'Sending support…',
  sendingEndorsementSupport: 'Sending endorsement support…',
  claimingSupport: 'Claiming support…',
  claimingRewards: 'Claiming SOCIAL…',
  swappingSocial: 'Getting SOCIAL…',
  collectingBoost: 'Collecting SOCIAL…',
} as const;

export const txToastSuccess = {
  socialCollected: 'SOCIAL collected.',
  joinedRally: (seasonTitle: string) => `You're in ${seasonTitle}.`,
  supportSent: (displayName: string) => `Support sent to ${displayName}.`,
  endorsementSupportSent: (displayName: string) =>
    `Support sent for ${displayName}'s endorsement.`,
  supportCollected: 'Support SOCIAL collected.',
  socialInWallet: 'SOCIAL is in your wallet.',
  rewardsCollected: (amountLabel: string) => `${amountLabel} SOCIAL collected.`,
  boostCollected: 'SOCIAL collected.',
} as const;

/** Wallet connect / OnSocial session key setup. */
export const txToastConnectPending = {
  settingUpSession: 'Setting up your session…',
  approveInWallet: 'Approve in your wallet…',
} as const;

export const txToastConnectSuccess = {
  sessionReady: "You're set to post on-chain.",
} as const;

export const txToastConnectError = {
  sessionSetupFailed: 'Session setup did not finish. Try connecting again.',
} as const;

export const txToastError = {
  collectSocialFailed: 'Could not collect SOCIAL.',
  joinRallyFailed: 'Could not join the rally.',
  supportFailed: 'Support did not go through.',
  endorsementSupportFailed: 'Endorsement support did not go through.',
  claimSupportFailed: 'Could not claim support.',
  claimRewardsFailed: 'Could not claim SOCIAL.',
  swapFailed: 'Could not get SOCIAL.',
  genericFailed: 'Transaction did not go through.',
} as const;

/** Formal governance / partners voice — still short; use with `trackTransaction`. */
export const txToastGovPending = {
  submittingProposal: 'Submitting proposal…',
  submittingPolicyProposal: 'Submitting policy proposal…',
  delegating: 'Delegating…',
  depositing: 'Depositing…',
  depositingAndDelegating: 'Depositing and delegating…',
  preparingGovernance: 'Preparing governance…',
  undelegating: 'Undelegating…',
  withdrawing: 'Withdrawing…',
  withdrawingExcess: 'Withdrawing excess…',
  registering: 'Registering…',
  actionSubmitted: (actionLabel: string) => `${actionLabel} submitted…`,
} as const;

export const txToastGovSuccess = {
  proposalSubmitted: 'Proposal submitted.',
  policyProposalSubmitted: 'Policy proposal submitted.',
  proposalConfirmedRefreshing: 'Proposal confirmed. Refreshing status…',
  delegationConfirmed: 'Delegation confirmed.',
  depositedAndDelegated: 'Deposited and delegated.',
  depositConfirmedCooldown:
    'Deposit confirmed. Delegation unlocks after cooldown.',
  registrationDepositDelegation:
    'Registration, deposit, and delegation confirmed.',
  registrationConfirmed: 'Registration confirmed.',
  undelegationConfirmed: 'Undelegation confirmed.',
  socialWithdrawn: 'SOCIAL withdrawn to wallet.',
  excessWithdrawn: 'Excess SOCIAL withdrawn to wallet.',
  keyAccessConfirmed: 'Key access confirmed.',
  governanceUpToDate: 'Governance is already up to date.',
  actionConfirmed: (actionLabel: string) => `${actionLabel} confirmed.`,
} as const;

export const txToastGovError = {
  proposalSubmissionFailed: 'Proposal submission failed.',
  policyProposalSubmissionFailed: 'Policy proposal submission failed.',
  proposalFailed: 'Proposal failed.',
  delegationFailed: 'Delegation failed.',
  depositFailed: 'Deposit failed.',
  depositOrDelegationFailed: 'Deposit or delegation failed.',
  undelegationFailed: 'Undelegation failed.',
  withdrawalFailed: 'Withdrawal failed.',
  registrationFailed: 'Registration failed.',
  governancePrepFailed: 'Governance preparation failed.',
  actionFailed: (actionLabel: string) => `${actionLabel} failed.`,
} as const;
