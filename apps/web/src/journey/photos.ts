import type { Id } from "@q9chat/convex";
import { useConvexConnectionState } from "convex/react";
import { Schema } from "effect";
import { useEffect, useReducer, useState } from "react";

import { convexClient } from "../lib/convex.js";
import { useSession } from "../lib/session.js";

const configuredSite: unknown = import.meta.env["VITE_CONVEX_SITE_URL"];
function httpActionOrigin(): string {
  if (typeof configuredSite === "string" && configuredSite !== "")
    return new URL(configuredSite).origin;
  if (new URL(convexClient.url).hostname.endsWith(".convex.cloud"))
    return convexClient.url.replace(/\.cloud$/u, ".site");
  throw new Error(
    "Set VITE_CONVEX_SITE_URL to the local Convex HTTP-action origin (normally http://127.0.0.1:3211).",
  );
}
const httpOrigin = httpActionOrigin();
const uploadResponse = Schema.Struct({
  // Convex validates the table at profiles.update; check the encoded ID at this HTTP boundary.
  uploadId: Schema.String.pipe(
    Schema.filter((id): id is Id<"uploads"> => /^[a-z0-9]{32}$/u.test(id)),
  ),
});

export async function uploadPhoto(file: File, token: string | null) {
  if (!token) throw new Error("Sign in again to upload a photo.");
  const response = await fetch(`${httpOrigin}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: file,
  });
  if (!response.ok) throw new Error("Couldn't upload your photo. Try again.");
  return Schema.decodeUnknownSync(uploadResponse)(await response.json()).uploadId;
}

function objectPhoto(blob: Blob) {
  // eslint-disable-next-line react-doctor/no-create-object-url-without-revoke -- false positive: The effect owns each returned resource and calls release on cleanup; the rule cannot follow that handle.
  const url = URL.createObjectURL(blob);
  return { url, release: () => URL.revokeObjectURL(url) };
}

type Photo = ReturnType<typeof objectPhoto>;
async function fetchPhotos(
  paths: readonly string[],
  token: string | null,
  signal: AbortSignal,
  resources: Photo[],
) {
  return Promise.all(
    paths.map(async (path) => {
      const response = await fetch(new URL(path, httpOrigin), {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!response.ok) throw new Error("Couldn't load a profile photo.");
      const blob = await response.blob();
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const photo = objectPhoto(blob);
      resources.push(photo);
      return [path, photo.url] as const;
    }),
  );
}

/** Photos are membership-protected; CSS image requests cannot send the access token. */
export function usePhotos(paths: readonly string[], onError: (message: string) => void) {
  const { fetchAccessToken } = useSession();
  const { connectionCount } = useConvexConnectionState();
  const [revision, refresh] = useReducer((value: number) => value + 1, 0);
  const [photos, setPhotos] = useState<ReadonlyMap<string, string>>(() => new Map());
  const key = JSON.stringify({ paths: [...new Set(paths)].toSorted(), connectionCount, revision });
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  // eslint-disable-next-line react-doctor/no-fetch-in-effect -- false positive: Convex owns the photo paths; private blobs need Bearer fetches with cancellation and resource cleanup, not image URLs.
  useEffect(() => {
    const controller = new AbortController();
    const resources: Photo[] = [];
    const requested = Schema.decodeUnknownSync(
      Schema.parseJson(
        Schema.Struct({
          paths: Schema.Array(Schema.String),
          connectionCount: Schema.Number,
          revision: Schema.Number,
        }),
      ),
    )(key).paths;
    const token = requested.length
      ? fetchAccessToken({ forceRefreshToken: false })
      : Promise.resolve(null);
    void token
      .then((value) => fetchPhotos(requested, value, controller.signal, resources))
      .then((entries) => {
        if (!controller.signal.aborted) setPhotos(new Map(entries));
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          onError(error instanceof Error ? error.message : "Couldn't load photos.");
      });
    return () => {
      controller.abort();
      resources.forEach((photo) => photo.release());
    };
  }, [key, fetchAccessToken, onError]);
  return { photos, refresh };
}
