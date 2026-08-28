import { SHEET_Z } from '@/lib/sheet-z';

/**
 * Protocol sheet stacking (same OS portal host as DAO slide-overs).
 *
 * DAO Proposals / Members / Treasury sit at 74. Manage opens Propose / Stake /
 * Settings / Info via the tools host, so task sheets stack above 74.
 * Bands come from the shared app scale (@/lib/sheet-z).
 */
export const PROTOCOL_TASK_SHEET_Z = SHEET_Z.shell;
/** Nested pickers / choice drawers above the task sheet. */
export const PROTOCOL_NESTED_CHOICE_Z = SHEET_Z.overShell;
/** Bond / eligibility hug above compose + nested choice drawers. */
export const PROTOCOL_CONFIRM_Z = SHEET_Z.confirm;
