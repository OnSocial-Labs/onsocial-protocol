// Global Vitest setup for mocking expo-secure-store
import { vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (_k, v) => v),
  getItemAsync: vi.fn(async (_k) => 'mock-jwt'),
  deleteItemAsync: vi.fn(async (_k) => undefined),
}));
