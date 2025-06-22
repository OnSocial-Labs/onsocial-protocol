import { saveToken, getToken, clearToken } from '../src/storage';
import { vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (_k, v) => v),
  getItemAsync: vi.fn(async (_k) => 'mock-jwt'),
  deleteItemAsync: vi.fn(async (_k) => undefined),
}));

describe('storage', () => {
  it('saves a token', async () => {
    await expect(saveToken('jwt')).resolves.toBe('jwt');
  });

  it('gets a token', async () => {
    await expect(getToken()).resolves.toBe('mock-jwt');
  });

  it('clears a token', async () => {
    await expect(clearToken()).resolves.toBeUndefined();
  });
});

describe('storage errors', () => {
  it('saveToken throws', async () => {
    vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(
      new Error('fail')
    );
    await expect(saveToken('jwt')).rejects.toThrow('fail');
  });
  it('getToken throws', async () => {
    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(
      new Error('fail')
    );
    await expect(getToken()).rejects.toThrow('fail');
  });
  it('clearToken throws', async () => {
    vi.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(
      new Error('fail')
    );
    await expect(clearToken()).rejects.toThrow('fail');
  });
});
