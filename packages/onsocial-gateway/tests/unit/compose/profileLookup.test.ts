import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/config/index.js', () => ({
  config: { nearNetwork: 'testnet' },
}));

vi.mock('../../../src/rpc/index.js', () => ({
  rpcQuery: vi.fn(),
}));

vi.mock('../../../src/services/compose/shared.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/services/compose/shared.js')
  >('../../../src/services/compose/shared.js');
  return {
    ...actual,
    fetchImageAsDataUri: vi.fn(),
    gatewayUrl: (cid: string) => `https://ipfs.example/${cid}`,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

import { rpcQuery } from '../../../src/rpc/index.js';
import {
  ComposeError,
  fetchImageAsDataUri,
} from '../../../src/services/compose/shared.js';
import {
  _resetProfileCache,
  getProfileAvatar,
  profileMediaRefToUrl,
  resolveCreatorAvatarDataUri,
} from '../../../src/services/compose/profileLookup.js';

const mockedRpc = vi.mocked(rpcQuery);
const mockedFetch = vi.mocked(fetchImageAsDataUri);

function avatarRpcResult(value: unknown) {
  return {
    result: Array.from(
      Buffer.from(JSON.stringify({ value }), 'utf-8').values()
    ),
  };
}

describe('profileMediaRefToUrl', () => {
  it('maps ipfs / https / bare CID', () => {
    expect(profileMediaRefToUrl('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png'
    );
    expect(profileMediaRefToUrl('ipfs://bafytest')).toBe(
      'https://ipfs.example/bafytest'
    );
    expect(profileMediaRefToUrl('bafytest')).toBe(
      'https://ipfs.example/bafytest'
    );
    expect(profileMediaRefToUrl('')).toBeNull();
  });
});

describe('getProfileAvatar', () => {
  beforeEach(() => {
    _resetProfileCache();
    mockedRpc.mockReset();
  });

  afterEach(() => {
    _resetProfileCache();
  });

  it('returns empty when unset and caches the empty answer', async () => {
    mockedRpc.mockResolvedValueOnce(avatarRpcResult(null));
    await expect(getProfileAvatar('alice.near')).resolves.toBe('');
    await expect(getProfileAvatar('alice.near')).resolves.toBe('');
    expect(mockedRpc).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed RPC as “no avatar”', async () => {
    mockedRpc.mockRejectedValueOnce(new Error('rpc down'));
    await expect(getProfileAvatar('alice.near')).rejects.toBeInstanceOf(
      ComposeError
    );
    mockedRpc.mockResolvedValueOnce(avatarRpcResult('ipfs://bafyface'));
    await expect(getProfileAvatar('alice.near')).resolves.toBe(
      'ipfs://bafyface'
    );
  });
});

describe('resolveCreatorAvatarDataUri', () => {
  beforeEach(() => {
    _resetProfileCache();
    mockedRpc.mockReset();
    mockedFetch.mockReset();
  });

  afterEach(() => {
    _resetProfileCache();
  });

  it('returns undefined when the author has no avatar', async () => {
    mockedRpc.mockResolvedValueOnce(avatarRpcResult(null));
    await expect(
      resolveCreatorAvatarDataUri('alice.near')
    ).resolves.toBeUndefined();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns an explicit data URI without fetching', async () => {
    await expect(
      resolveCreatorAvatarDataUri('alice.near', 'data:image/png;base64,abc')
    ).resolves.toBe('data:image/png;base64,abc');
    expect(mockedRpc).not.toHaveBeenCalled();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('retries fetch then throws when avatar is set but unfetchable', async () => {
    mockedRpc.mockResolvedValueOnce(avatarRpcResult('ipfs://bafyface'));
    mockedFetch
      .mockRejectedValueOnce(new ComposeError(502, 'fail 1'))
      .mockRejectedValueOnce(new ComposeError(502, 'fail 2'))
      .mockRejectedValueOnce(new ComposeError(502, 'fail 3'));

    await expect(resolveCreatorAvatarDataUri('alice.near')).rejects.toThrow(
      /could not be baked into the card/i
    );
    expect(mockedFetch).toHaveBeenCalledTimes(3);
  });

  it('succeeds on a later retry when avatar is set', async () => {
    mockedRpc.mockResolvedValueOnce(avatarRpcResult('ipfs://bafyface'));
    mockedFetch
      .mockRejectedValueOnce(new ComposeError(502, 'transient'))
      .mockResolvedValueOnce('data:image/png;base64,ok');

    await expect(resolveCreatorAvatarDataUri('alice.near')).resolves.toBe(
      'data:image/png;base64,ok'
    );
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('throws when an explicit avatar ref cannot be turned into a URL', async () => {
    await expect(
      resolveCreatorAvatarDataUri('alice.near', 'not a valid ref!!!')
    ).rejects.toThrow(/could not be used on the card/i);
  });
});
