const arrivalKey = "q9.oauth-arrival";

function tryStorage<T>(operation: (storage: Storage) => T): T | null {
  try {
    return operation(sessionStorage);
  } catch {
    return null;
  }
}

export function startOAuth(provider: "google" | "apple") {
  tryStorage((storage) => storage.setItem(arrivalKey, provider));
  window.location.assign(`/api/auth/oauth/${provider}?client=web`);
}

export function oauthArrivalMessage(method: string | null) {
  const arrival = tryStorage((storage) => storage.getItem(arrivalKey));
  if (arrival !== method) return "";
  const provider = method === "google" ? "Google" : method === "apple" ? "Apple" : null;
  return provider ? `Signed in with ${provider}` : "";
}

export function clearOAuthArrival() {
  tryStorage((storage) => storage.removeItem(arrivalKey));
}
