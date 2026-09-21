import { describe, expect, it } from 'vitest';
import { feedPanelHopHref } from './account-place-link';

describe('feed panel hop', () => {
  it('opens the author face directly from Home', () => {
    expect(
      feedPanelHopHref(
        '/home',
        '/@alice.testnet?essay=42&from=%2Fhome'
      )
    ).toBeNull();
  });

  it('reaches Writing from the face so Home does not intercept it', () => {
    expect(
      feedPanelHopHref(
        '/home',
        '/@alice.testnet/writing?essay=42&from=%2Fhome'
      )
    ).toBe('/@alice.testnet?essay=42&from=%2Fhome&shelf=%2Fwriting');
  });

  it('leaves a profile-to-shelf link on the real shelf path', () => {
    expect(
      feedPanelHopHref(
        '/@alice.testnet',
        '/@alice.testnet/writing?essay=42&from=%2Fhome'
      )
    ).toBeNull();
  });
});
