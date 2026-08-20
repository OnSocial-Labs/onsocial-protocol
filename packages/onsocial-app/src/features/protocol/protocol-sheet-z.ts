/**
 * Protocol sheet stacking (same OS portal host as DAO slide-overs).
 *
 * DAO Proposals / Members / Treasury sit at 74. Manage hub opens those
 * tools via the proposals workspace, so task sheets must stack above 74
 * or Propose / Stake / Settings / Info open "under" the proposals page.
 */
export const PROTOCOL_TASK_SHEET_Z = 80;
/** Nested pickers / choice drawers above the task sheet. */
export const PROTOCOL_NESTED_CHOICE_Z = 90;
/** Bond / eligibility hug above compose + nested choice drawers. */
export const PROTOCOL_CONFIRM_Z = 110;
