import * as SecureStore from 'expo-secure-store';

export const saveToken = (jwt: string) =>
  SecureStore.setItemAsync('onsocial-jwt', jwt);

export const getToken = () => SecureStore.getItemAsync('onsocial-jwt');

export const clearToken = () => SecureStore.deleteItemAsync('onsocial-jwt');
