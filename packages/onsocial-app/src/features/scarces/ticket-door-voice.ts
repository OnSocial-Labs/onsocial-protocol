import type { PassStaffVoice } from '@/features/scarces/ticket-pass-payload';

/** Logged-out staff door / redeem empty state. */
export function ticketStaffConnectHint(voice: PassStaffVoice): string {
  return voice === 'redeem'
    ? 'Connect to redeem coupons.'
    : 'Connect to admit guests.';
}

/** Admit / Redeem tap without a session. */
export function ticketStaffConnectError(voice: PassStaffVoice): string {
  return voice === 'redeem' ? 'Connect to redeem.' : 'Connect to admit.';
}

/** Guest Show pass when no wallet is connected. */
export const TICKET_PASS_CONNECT_LIVE = 'Connect to show a live pass.';

/** Footer owns Connect — hide the dock hint so the page says it once. */
export function ticketStaffFooterOwnsConnect(opts: {
  isPassDrop: boolean;
  voiceMatches: boolean;
  isConnected: boolean;
}): boolean {
  return opts.isPassDrop && opts.voiceMatches && !opts.isConnected;
}
