import { Schema } from "effect";
import { useEffect, useReducer, useRef, useState } from "react";

import { useSession } from "../lib/session.js";
import { httpOrigin } from "./photos.js";

/** Own private display bytes for one mounted account/group, never bearer URLs in DOM. */
export function useMediaResources(paths: readonly string[], onError: (message: string) => void) {
  const { fetchAccessToken } = useSession();
  const cache = useRef(new Map<string, string>());
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const key = JSON.stringify({ paths: [...new Set(paths)].toSorted(), revision });
  useEffect(() => {
    const owned = cache.current;
    return () => {
      owned.forEach((url) => URL.revokeObjectURL(url));
      owned.clear();
    };
  }, []);
  // eslint-disable-next-line react-doctor/no-fetch-in-effect -- Intentional because protected Convex bytes require authenticated fetches; this effect owns and aborts all requests.
  useEffect(() => {
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    const requested = Schema.decodeUnknownSync(
      Schema.parseJson(
        Schema.Struct({ paths: Schema.Array(Schema.String), revision: Schema.Number }),
      ),
    )(key).paths;
    const wanted = new Set(requested);
    for (const [path, url] of cache.current) {
      if (!wanted.has(path)) {
        URL.revokeObjectURL(url);
        cache.current.delete(path);
      }
    }
    const missing = requested.filter((path) => !cache.current.has(path));
    void (async () => {
      const token = missing.length ? await fetchAccessToken({ forceRefreshToken: false }) : null;
      if (aborted()) return;
      if (missing.length && !token) throw new Error("Sign in again to load attachments.");
      // Bound simultaneous buffering, even for a full history page of attachments.
      for (let start = 0; start < missing.length; start += 3) {
        await Promise.all(
          missing.slice(start, start + 3).map(async (path) => {
            try {
              const response = await fetch(new URL(path, httpOrigin), {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
              });
              if (!response.ok)
                throw new Error("Couldn't load an attachment. Retry when connected.");
              const blob = await response.blob();
              if (aborted()) return;
              // eslint-disable-next-line react-doctor/no-create-object-url-without-revoke -- Safe because the mounted account/group cache above owns and revokes this resource.
              cache.current.set(path, URL.createObjectURL(blob));
              setUrls(new Map(cache.current));
            } catch (cause) {
              if (!aborted())
                onError(
                  cause instanceof Error ? cause.message : "Couldn't load an attachment. Retry.",
                );
            }
          }),
        );
        if (aborted()) return;
      }
    })().catch((cause: unknown) => {
      if (!aborted())
        onError(cause instanceof Error ? cause.message : "Couldn't load attachments. Retry.");
    });
    return () => controller.abort();
  }, [key, fetchAccessToken, onError]);
  return { urls, refresh };
}
