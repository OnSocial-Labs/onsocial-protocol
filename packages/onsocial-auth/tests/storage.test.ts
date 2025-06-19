import { saveToken, getToken, clearToken } from '../src/storage';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async (_k, v) => v),
  getItemAsync: jest.fn(async (_k) => 'mock-jwt'),
  deleteItemAsync: jest.fn(async (_k) => undefined),
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
    const SecureStore = require('expo-secure-store');
    SecureStore.setItemAsync.mockImplementationOnce(async () => {
      throw new Error('fail');
    });
    await expect(saveToken('jwt')).rejects.toThrow('fail');
  });
  it('getToken throws', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockImplementationOnce(async () => {
      throw new Error('fail');
    });
    await expect(getToken()).rejects.toThrow('fail');
  });
  it('clearToken throws', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.deleteItemAsync.mockImplementationOnce(async () => {
      throw new Error('fail');
    });
    await expect(clearToken()).rejects.toThrow('fail');
  });
});
