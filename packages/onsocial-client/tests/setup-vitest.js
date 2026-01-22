// Load env from root .env file (only if not already set by CI)
import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envPath = resolve(__dirname, '../../../.env');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const trimmedKey = key.trim();
      // Don't overwrite if already set (e.g., from GitHub Actions secrets)
      if (!process.env[trimmedKey]) {
        process.env[trimmedKey] = valueParts.join('=').trim();
      }
    }
  });
} catch (e) {
  // .env file not found (expected in CI), skip
}

// Mocks for expo-secure-store and @react-native-async-storage/async-storage for Node.js/Vitest
globalThis.__secureStore = {};

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key) => globalThis.__secureStore[key] || null),
  setItemAsync: vi.fn(async (key, value) => {
    globalThis.__secureStore[key] = value;
  }),
  deleteItemAsync: vi.fn(async (key) => {
    delete globalThis.__secureStore[key];
  }),
}));

let __asyncStorage = {};
vi.mock('@react-native-async-storage/async-storage', () => ({
  getItem: vi.fn(async (key) => __asyncStorage[key] || null),
  setItem: vi.fn(async (key, value) => {
    __asyncStorage[key] = value;
  }),
  removeItem: vi.fn(async (key) => {
    delete __asyncStorage[key];
  }),
  clear: vi.fn(async () => {
    __asyncStorage = {};
  }),
}));
