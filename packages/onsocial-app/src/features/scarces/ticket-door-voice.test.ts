import { describe, expect, it } from 'vitest';
import {
  TICKET_PASS_CONNECT_LIVE,
  ticketStaffConnectError,
  ticketStaffConnectHint,
  ticketStaffFooterOwnsConnect,
} from '@/features/scarces/ticket-door-voice';

describe('ticket door / redeem Connect voice', () => {
  it('asks staff to Connect, not Connect wallet', () => {
    expect(ticketStaffConnectHint('admit')).toBe('Connect to admit guests.');
    expect(ticketStaffConnectHint('redeem')).toBe(
      'Connect to redeem coupons.'
    );
    expect(ticketStaffConnectError('admit')).toBe('Connect to admit.');
    expect(ticketStaffConnectError('redeem')).toBe('Connect to redeem.');
    expect(TICKET_PASS_CONNECT_LIVE).toBe('Connect to show a live pass.');
  });

  it('lets the footer own Connect on a matching staff drop', () => {
    expect(
      ticketStaffFooterOwnsConnect({
        isPassDrop: true,
        voiceMatches: true,
        isConnected: false,
      })
    ).toBe(true);
    expect(
      ticketStaffFooterOwnsConnect({
        isPassDrop: true,
        voiceMatches: true,
        isConnected: true,
      })
    ).toBe(false);
    expect(
      ticketStaffFooterOwnsConnect({
        isPassDrop: false,
        voiceMatches: true,
        isConnected: false,
      })
    ).toBe(false);
  });
});
