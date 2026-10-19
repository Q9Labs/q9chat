import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "../lib/session.js";
import { DisplayResources } from "./display-resources.js";
import { httpOrigin } from "./photos.js";

function lifetimeSignal(owner: AbortController | null) {
  return owner?.signal ?? AbortSignal.abort();
}

async function protectedBlob(path: string, token: string | null, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!token) throw new Error("Sign in again to load attachments.");
  const response = await fetch(new URL(path, httpOrigin), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok) throw new Error("Couldn't load an attachment. Retry when connected.");
  return response.blob();
}

/** Account/group owns private bytes; the idle budget never invalidates mounted consumers. */
export function useMediaResources() {
  const [error, setError] = useState("");
  const { fetchAccessToken } = useSession();
  const [cache] = useState(() => new DisplayResources());
  const pending = useRef(
    new Map<string, { controller: AbortController; result: Promise<string> }>(),
  );
  const lifetime = useRef<AbortController | null>(null);
  const lanes = useRef<Promise<void>[]>([]);
  const nextLane = useRef(0);
  const failed = useRef(new Set<string>());
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const publish = useCallback(() => {
    setUrls(cache.urls());
  }, [cache]);
  const release = useCallback(
    (path: string) => {
      const url = cache.release(path);
      if (cache.held(path)) return;
      pending.current.get(path)?.controller.abort();
      pending.current.delete(path);
      failed.current.delete(path);
      if (url) URL.revokeObjectURL(url);
      publish();
    },
    [cache, publish],
  );
  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    const owned = cache;
    const requests = pending.current;
    return () => {
      owner.abort();
      requests.forEach(({ controller }) => controller.abort());
      requests.clear();
      owned.clear().forEach((url) => URL.revokeObjectURL(url));
    };
  }, [cache]);
  const load = useCallback(
    async (path: string): Promise<string> => {
      const existing = cache.get(path);
      if (existing) return existing;
      const underway = pending.current.get(path);
      if (underway) return underway.result;
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, lifetimeSignal(lifetime.current)]);
      const lane = nextLane.current++ % 3;
      const previous = lanes.current[lane];
      const result = (async () => {
        await previous;
        signal.throwIfAborted();
        const token = await fetchAccessToken({ forceRefreshToken: false });
        const blob = await protectedBlob(path, token, signal);
        signal.throwIfAborted();
        // eslint-disable-next-line react-doctor/no-create-object-url-without-revoke -- Safe because the owned cache revokes URLs on release, idle eviction and unmount.
        const url = URL.createObjectURL(blob);
        cache.add(path, { url, bytes: blob.size }).forEach((idle) => URL.revokeObjectURL(idle));
        failed.current.delete(path);
        publish();
        return url;
      })();
      lanes.current[lane] = result.then(
        () => {},
        () => {},
      );
      pending.current.set(path, { controller, result });
      try {
        return await result;
      } catch (cause) {
        if (!signal.aborted) {
          failed.current.add(path);
          setError(cause instanceof Error ? cause.message : "Couldn't load an attachment. Retry.");
        }
        throw cause;
      } finally {
        if (!controller.signal.aborted) pending.current.delete(path);
      }
    },
    [cache, fetchAccessToken, publish],
  );
  const retain = useCallback((path: string) => cache.retain(path), [cache]);
  return {
    error,
    urls,
    retain,
    load,
    release,
    retry: () => {
      setError("");
      void Promise.allSettled([...failed.current].map(load));
    },
  };
}
