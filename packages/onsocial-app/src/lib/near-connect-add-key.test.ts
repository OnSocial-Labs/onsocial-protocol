import { describe, expect, it } from 'vitest';
import { nearActionsToConnectorActions } from '@hot-labs/near-connect';

describe('nearActionsToConnectorActions AddKey', () => {
  it('throws when an untyped AddKey permission is neither functionCall nor fullAccess', () => {
    const untyped = {
      addKey: {
        publicKey: {
          toString: () => 'ed25519:11111111111111111111111111111111',
        },
        accessKey: {
          nonce: 0,
          permission: { notAPermission: true },
        },
      },
    };

    expect(() =>
      nearActionsToConnectorActions([
        untyped as unknown as Parameters<
          typeof nearActionsToConnectorActions
        >[0][number],
      ])
    ).toThrow(/Unsupported access-key permission on AddKey/);
  });

  it('returns a typed function-call AddKey unchanged', () => {
    const typed = {
      type: 'AddKey' as const,
      params: {
        publicKey: 'ed25519:session',
        accessKey: {
          permission: {
            receiverId: 'social.near',
            methodNames: ['set'],
          },
        },
      },
    };

    const [returned] = nearActionsToConnectorActions([typed]);
    expect(returned).toBe(typed);
  });
});
