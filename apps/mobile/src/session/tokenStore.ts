import * as SecureStore from "expo-secure-store";

import type { Store, StoreKey } from "./storage.ts";

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const nameOf = (key: StoreKey) => `q9chat.${key}`;

/** The session's secrets live in the keychain or keystore, never in AsyncStorage. */
export const tokenStore: Store = {
  get: (key) => SecureStore.getItemAsync(nameOf(key), options),
  set: (key, value) => SecureStore.setItemAsync(nameOf(key), value, options),
  delete: (key) => SecureStore.deleteItemAsync(nameOf(key), options),
};
