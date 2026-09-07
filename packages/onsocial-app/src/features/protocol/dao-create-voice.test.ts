import { describe, expect, it } from 'vitest';
import {
  DAO_CREATE_ADVANCED,
  DAO_CREATE_ADVANCED_HIDE,
  DAO_CREATE_CONNECT_CTA,
  DAO_CREATE_CONNECT_HINT,
  DAO_CREATE_PUBLISH,
  daoCreateNearShortHint,
  daoCreatePurposeToggle,
  daoCreateWhisper,
} from '@/features/protocol/dao-create-voice';

describe('DAO create Connect voice', () => {
  it('asks Connect, not Connect wallet', () => {
    expect(DAO_CREATE_CONNECT_CTA).toBe('Connect');
    expect(DAO_CREATE_CONNECT_CTA.toLowerCase()).not.toContain('wallet');
  });

  it('hints Connect to create a DAO', () => {
    expect(DAO_CREATE_CONNECT_HINT).toBe('Connect to create a DAO.');
    expect(DAO_CREATE_CONNECT_HINT.toLowerCase()).not.toContain('wallet');
  });

  it('parks extras behind Advanced', () => {
    expect(DAO_CREATE_ADVANCED).toBe('Advanced');
    expect(DAO_CREATE_ADVANCED_HIDE).toBe('Hide advanced');
  });

  it('offers Publish OnSocial profile on the same create step', () => {
    expect(DAO_CREATE_PUBLISH).toBe('Publish OnSocial profile');
    expect(DAO_CREATE_PUBLISH.toLowerCase()).not.toContain('call');
    expect(DAO_CREATE_PUBLISH.toLowerCase()).not.toContain('bond');
  });

  it('whispers the attach amount without gas or bond', () => {
    expect(daoCreateWhisper('6')).toBe('You start as council · ~6 NEAR');
    expect(daoCreateWhisper('6.1')).toBe('You start as council · ~6.1 NEAR');
    expect(daoCreateWhisper('6').toLowerCase()).not.toContain('gas');
    expect(daoCreateWhisper('6.1').toLowerCase()).not.toContain('bond');
    expect(daoCreateNearShortHint('0.4')).toBe('Need ~0.4 more NEAR.');
    expect(daoCreateNearShortHint('0.1').toLowerCase()).not.toContain('bond');
    expect(daoCreateNearShortHint('0.1').toLowerCase()).not.toContain('gas');
    expect(daoCreateNearShortHint('0.1').toLowerCase()).not.toContain('wallet');
  });

  it('waits purpose behind Add a purpose', () => {
    expect(daoCreatePurposeToggle({ open: false, hasText: false })).toBe(
      'Add a purpose'
    );
    expect(daoCreatePurposeToggle({ open: false, hasText: true })).toBe(
      'Edit purpose'
    );
    expect(daoCreatePurposeToggle({ open: true, hasText: true })).toBe(
      'Hide purpose'
    );
  });
});
