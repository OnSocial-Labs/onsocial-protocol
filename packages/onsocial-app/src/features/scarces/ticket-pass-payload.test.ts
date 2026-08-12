import { describe, expect, it } from 'vitest';
import {
  encodeTicketPassPayload,
  isPassMediumKind,
  parseTicketPassPayload,
  passStaffVoice,
  ticketPassRemaining,
  ticketPassStatusLabel,
} from '@/features/scarces/ticket-pass-payload';

describe('ticket-pass-payload', () => {
  it('encodes and parses os1 payloads', () => {
    const encoded = encodeTicketPassPayload('night-drive', 'night-drive:3');
    expect(encoded).toBe('os1:night-drive:night-drive:3');
    expect(parseTicketPassPayload(encoded!)).toEqual({
      collectionId: 'night-drive',
      tokenId: 'night-drive:3',
    });
  });

  it('parses bare token ids for the expected collection', () => {
    expect(parseTicketPassPayload('night-drive:3', 'night-drive')).toEqual({
      collectionId: 'night-drive',
      tokenId: 'night-drive:3',
    });
    expect(parseTicketPassPayload('other:1', 'night-drive')).toBeNull();
    expect(parseTicketPassPayload('s:post')).toBeNull();
  });

  it('rejects payloads for a different collection', () => {
    expect(
      parseTicketPassPayload('os1:other:other:1', 'night-drive')
    ).toBeNull();
  });

  it('identifies pass mediums and staff voice', () => {
    expect(isPassMediumKind('ticket')).toBe(true);
    expect(isPassMediumKind('membership')).toBe(true);
    expect(isPassMediumKind('coupon')).toBe(true);
    expect(isPassMediumKind('writing')).toBe(false);
    expect(passStaffVoice('ticket')).toBe('admit');
    expect(passStaffVoice('membership')).toBe('admit');
    expect(passStaffVoice('coupon')).toBe('redeem');
  });

  it('computes remaining check-ins and status copy', () => {
    expect(ticketPassRemaining({ redeemCount: 0, maxRedeems: 1 })).toBe(1);
    expect(ticketPassRemaining({ redeemCount: 1, maxRedeems: 1 })).toBe(0);
    expect(ticketPassRemaining({ redeemCount: 0, maxRedeems: null })).toBeNull();

    expect(
      ticketPassStatusLabel({
        isValid: true,
        isFullyRedeemed: false,
        isRevoked: false,
        isExpired: false,
        redeemCount: 0,
        maxRedeems: 1,
      })
    ).toBe('1 check-in left');

    expect(
      ticketPassStatusLabel({
        isValid: false,
        isFullyRedeemed: true,
        isRevoked: false,
        isExpired: false,
        redeemCount: 1,
        maxRedeems: 1,
      })
    ).toBe('Fully checked in');

    expect(
      ticketPassStatusLabel({
        isValid: true,
        isFullyRedeemed: false,
        isRevoked: false,
        isExpired: false,
        redeemCount: 0,
        maxRedeems: 1,
        voice: 'redeem',
      })
    ).toBe('1 redeem left');

    expect(
      ticketPassStatusLabel({
        isValid: false,
        isFullyRedeemed: true,
        isRevoked: false,
        isExpired: false,
        redeemCount: 1,
        maxRedeems: 1,
        voice: 'redeem',
      })
    ).toBe('Fully redeemed');
  });
});
