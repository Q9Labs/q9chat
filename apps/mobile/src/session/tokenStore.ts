import * as SecureStore from "expo-secure-store";

const KEY = "q9chat.refreshToken";
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** The refresh token, the one long-lived secret. It lives in the keychain or keystore, never in AsyncStorage. */
export const tokenStore = {
  read: () => SecureStore.getItemAsync(KEY, options),
  write: (token: string) => SecureStore.setItemAsync(KEY, token, options),
  clear: () => SecureStore.deleteItemAsync(KEY, options),
};
