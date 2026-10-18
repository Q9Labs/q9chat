const joinReturnSlot = "q9.join-return";

const oauthArrivalSlot = "q9.oauth-arrival";

function tryStorage<T>(operation: (storage: Storage) => T): T | null {
  try {
    return operation(sessionStorage);
  } catch {
    return null;
  }
}

export function savedJoinPath() {
  const path = tryStorage((storage) => storage.getItem(joinReturnSlot));
  if (path && /^\/join\/[A-Za-z0-9]{16,32}$/u.test(path)) return path;
  clearSavedJoin();
  return null;
}

export function clearSavedJoin() {
  tryStorage((storage) => storage.removeItem(joinReturnSlot));
}

export function rememberJoinPath() {
  const path = window.location.pathname;
  if (/^\/join\/[A-Za-z0-9]{16,32}$/u.test(path)) {
    tryStorage((storage) => storage.setItem(joinReturnSlot, path));
    return path;
  }
  if (path.startsWith("/join/")) clearSavedJoin();
  return null;
}

export function startOAuth(provider: "google" | "apple") {
  tryStorage((storage) => storage.setItem(oauthArrivalSlot, provider));
  const path = rememberJoinPath();
  const returnTo = path ? `&returnTo=${encodeURIComponent(path)}` : "";
  window.location.assign(`/api/auth/oauth/${provider}?client=web${returnTo}`);
}

export function oauthArrivalMessage(method: string | null) {
  const arrival = tryStorage((storage) => storage.getItem(oauthArrivalSlot));
  if (arrival !== method) return "";
  const provider = method === "google" ? "Google" : method === "apple" ? "Apple" : null;
  return provider ? `Signed in with ${provider}` : "";
}

export function clearOAuthArrival() {
  tryStorage((storage) => storage.removeItem(oauthArrivalSlot));
}
