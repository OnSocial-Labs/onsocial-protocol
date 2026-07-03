import {
  creditPlatformRewardSafe,
  creditPlatformSocialReward,
  type CreditPlatformRewardInput,
} from '@onsocial/sdk';
import { emitAppRewardCredited } from '@/lib/app-reward-events';

type CreditAppPlatformRewardInput = Omit<
  CreditPlatformRewardInput,
  'onCredited' | 'actionPath'
>;

function withCreditHandler<T extends CreditAppPlatformRewardInput>(
  input: T
): T & Pick<CreditPlatformRewardInput, 'onCredited'> {
  return {
    ...input,
    onCredited: emitAppRewardCredited,
  };
}

export function creditAppPlatformReward(
  input: CreditAppPlatformRewardInput
): void {
  creditPlatformRewardSafe(withCreditHandler(input));
}

export function creditAppPlatformSocialReward(
  input: Omit<CreditAppPlatformRewardInput, 'action'> & {
    action: Exclude<CreditAppPlatformRewardInput['action'], 'daily_active'>;
  }
): void {
  creditPlatformSocialReward(withCreditHandler(input));
}
