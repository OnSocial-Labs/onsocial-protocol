// Global Vitest setup for mocking expo-secure-store
import { vi } from 'vitest';

vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (__k, v) => v),
  getItemAsync: vi.fn(async (__k) => 'mock-jwt'),
  deleteItemAsync: vi.fn(async (__k) => undefined),
}));
