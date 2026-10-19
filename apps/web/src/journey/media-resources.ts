import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "../lib/session.js";
import { httpOrigin } from "./photos.js";

const MAX_DISPLAY_BYTES = 40_000_000;
const MAX_DISPLAY_URLS = 8;
interface Resource {
  readonly url: string;
  readonly bytes: number;
}

function displayResource(
  cache: Map<string, Resource>,
  path: string,
  blob: Blob,
  release: (path: string) => void,
) {
  while (
    cache.size >= MAX_DISPLAY_URLS ||
    [...cache.values()].reduce((total, item) => total + item.bytes, blob.size) > MAX_DISPLAY_BYTES
  ) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) throw new Error("That attachment is too large to display.");
    release(oldest);
  }
  // eslint-disable-next-line react-doctor/no-create-object-url-without-revoke -- Safe because the mounted bounded cache owns and revokes this URL on release, eviction and unmount.
  const url = URL.createObjectURL(blob);
  cache.set(path, { url, bytes: blob.size });
  return url;
}

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

/** Mounted account/group owns bounded private bytes; callers own activation/visibility. */
export function useMediaResources(onError: (message: string) => void) {
  const { fetchAccessToken } = useSession();
  const cache = useRef(new Map<string, Resource>());
  const pending = useRef(
    new Map<string, { controller: AbortController; result: Promise<string> }>(),
  );
  const lifetime = useRef<AbortController | null>(null);
  const lanes = useRef<Promise<void>[]>([]);
  const nextLane = useRef(0);
  const failed = useRef(new Set<string>());
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const publish = useCallback(() => {
    setUrls(new Map([...cache.current].map(([path, value]) => [path, value.url])));
  }, []);
  const release = useCallback(
    (path: string) => {
      pending.current.get(path)?.controller.abort();
      pending.current.delete(path);
      failed.current.delete(path);
      const value = cache.current.get(path);
      if (value) URL.revokeObjectURL(value.url);
      cache.current.delete(path);
      publish();
    },
    [publish],
  );
  useEffect(() => {
    const owner = new AbortController();
    lifetime.current = owner;
    const owned = cache.current;
    const requests = pending.current;
    return () => {
      owner.abort();
      requests.forEach(({ controller }) => controller.abort());
      requests.clear();
      owned.forEach(({ url }) => URL.revokeObjectURL(url));
      owned.clear();
    };
  }, []);
  const load = useCallback(
    async (path: string): Promise<string> => {
      const existing = cache.current.get(path);
      if (existing) return existing.url;
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
        const url = displayResource(cache.current, path, blob, release);
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
          onError(cause instanceof Error ? cause.message : "Couldn't load an attachment. Retry.");
        }
        throw cause;
      } finally {
        if (!controller.signal.aborted) pending.current.delete(path);
      }
    },
    [fetchAccessToken, onError, publish, release],
  );
  return {
    urls,
    load,
    release,
    retry: () => {
      void Promise.allSettled([...failed.current].map(load));
    },
  };
}
