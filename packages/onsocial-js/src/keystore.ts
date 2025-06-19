// src/keystore.ts
// Expo Go compatible keystore abstraction for onsocial-js
// Uses expo-secure-store if available, otherwise falls back to AsyncStorage

// These imports are only type-safe in Expo/React Native environments
let SecureStore: any = null;
let AsyncStorage: any = null;

try {
  SecureStore = require('expo-secure-store');
} catch {}
try {
  AsyncStorage = require('@react-native-async-storage/async-storage');
} catch {}

export class Keystore {
  static async setItem(key: string, value: string): Promise<void> {
    if (SecureStore && SecureStore.setItemAsync) {
      await SecureStore.setItemAsync(key, value);
    } else if (AsyncStorage && AsyncStorage.setItem) {
      await AsyncStorage.setItem(key, value);
    } else {
      throw new Error('No secure storage available');
    }
  }

  static async getItem(key: string): Promise<string | null> {
    if (SecureStore && SecureStore.getItemAsync) {
      return await SecureStore.getItemAsync(key);
    } else if (AsyncStorage && AsyncStorage.getItem) {
      return await AsyncStorage.getItem(key);
    } else {
      throw new Error('No secure storage available');
    }
  }

  static async removeItem(key: string): Promise<void> {
    if (SecureStore && SecureStore.deleteItemAsync) {
      await SecureStore.deleteItemAsync(key);
    } else if (AsyncStorage && AsyncStorage.removeItem) {
      await AsyncStorage.removeItem(key);
    } else {
      throw new Error('No secure storage available');
    }
  }
}
