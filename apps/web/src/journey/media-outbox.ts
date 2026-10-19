import { api } from "@q9chat/convex";
import { useConvex, useConvexConnectionState, useMutation } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { Schema } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Attachment, PostView } from "../chat/types.js";
import { transportLifetime } from "../lib/convex.js";
import { useSession } from "../lib/session.js";
import { loadMedia, removeMedia, saveMedia, type Media, type SavedMedia } from "./media-storage.js";
import { httpOrigin, uploadResponse } from "./photos.js";

type Group = Extract<FunctionReturnType<typeof api.groups.get>, { status: "member" }>;
type Row = FunctionReturnType<typeof api.messages.range>[number];
type Receipt = FunctionReturnType<typeof api.messages.send>;
type Delivery =
  | { readonly status: "sending" | "failed" | "queued"; readonly receipt: null }
  | { readonly status: "sent"; readonly receipt: Receipt };
type Pending = SavedMedia & {
  readonly previews: readonly Attachment[];
  readonly afterSequence: number;
} & Delivery;
type Upload = FunctionArgs<typeof api.messages.send>["attachments"][number];

function localAttachment(file: Media, url: string): Attachment {
  switch (file.kind) {
    case "image":
      return { ...file, url, label: "Image" };
    case "file":
      return { kind: "file", url, name: file.name, size: file.blob.size };
    case "voice":
      return { ...file, url };
    default: {
      const unreachable: never = file;
      return unreachable;
    }
  }
}

async function uploadMedia(file: Media, token: string, signal: AbortSignal): Promise<Upload> {
  // Fresh uploads recover swept and partially completed attempts; message keys deduplicate delivery.
  const response = await fetch(`${httpOrigin}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: file.blob,
    signal,
  });
  if (response.status === 413) throw new Error("That file is over 20 MB. Choose a smaller one.");
  if (!response.ok) throw new Error("Couldn't upload the attachment. Retry when connected.");
  const { uploadId } = Schema.decodeUnknownSync(uploadResponse)(await response.json());
  switch (file.kind) {
    case "image":
      return { kind: "image", uploadId, width: file.width, height: file.height };
    case "file":
      return { kind: "file", uploadId, name: file.name };
    case "voice":
      return { kind: "voice", uploadId, durationMs: file.durationMs, waveform: [...file.waveform] };
    default: {
      const unreachable: never = file;
      return unreachable;
    }
  }
}
function availableController(
  controller: AbortController | null,
  lifetime: AbortSignal,
  pending: ReadonlySet<string>,
  key: string,
) {
  return controller && !controller.signal.aborted && !lifetime.aborted && !pending.has(key)
    ? controller
    : null;
}
function deliveryError(cause: unknown) {
  return cause instanceof Error ? cause.message : "Attachment not sent. Retry.";
}
function pendingState(post: Pending, connected: boolean) {
  if (post.status === "sent") return {};
  return { sendState: post.status === "sending" && !connected ? ("queued" as const) : post.status };
}

export function useMediaOutbox(group: Group, rows: readonly Row[]) {
  const me = group.members.find((person) => person.isYou);
  if (!me) throw new Error("Missing group member");
  const scope = `${me.id}:${group.groupId}`;
  const lifetime = transportLifetime(useConvex());
  const { fetchAccessToken } = useSession();
  const connection = useConvexConnectionState();
  const send = useMutation(api.messages.send);
  const [posts, setPosts] = useState<readonly Pending[]>([]);
  const [error, setError] = useState("");
  const inFlight = useRef(new Set<string>());
  const resources = useRef(new Map<Blob, string>());
  const [openedAtSequence] = useState(group.lastSequence);
  const operation = useRef<AbortController | null>(null);
  const active = () =>
    operation.current !== null && !operation.current.signal.aborted && !lifetime.aborted;
  const committed = new Set(
    rows.flatMap((row) => (row.kind === "post" && row.author.isYou ? [row.clientKey] : [])),
  );

  const localUrl = useCallback((blob: Blob) => {
    const previous = resources.current.get(blob);
    if (previous) return previous;
    // eslint-disable-next-line react-doctor/no-create-object-url-without-revoke -- Safe because the account/group lifetime above revokes all owned local previews.
    const next = URL.createObjectURL(blob);
    resources.current.set(blob, next);
    return next;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    operation.current = controller;
    void loadMedia(scope)
      .then((saved) => {
        if (controller.signal.aborted) return;
        if (saved.damaged)
          setError(
            "Some unsent attachments could not be restored. Healthy attachments are available to retry; damaged data was kept on this device.",
          );
        setPosts((current) => [
          ...current,
          ...saved.posts
            .filter((post) => !current.some((item) => item.clientKey === post.clientKey))
            .map((post): Pending => ({
              ...post,
              status: "failed",
              receipt: null,
              afterSequence: openedAtSequence,
              previews: post.files.map((file) => localAttachment(file, localUrl(file.blob))),
            })),
        ]);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Couldn't read unsent attachments on this device. Keep this tab open and retry.",
          );
      });
    const release = () => {
      controller.abort();
      if (operation.current === controller) operation.current = null;
      resources.current.forEach((url) => URL.revokeObjectURL(url));
      resources.current.clear();
    };
    lifetime.addEventListener("abort", release, { once: true });
    return () => {
      lifetime.removeEventListener("abort", release);
      release();
    };
  }, [scope, lifetime, openedAtSequence, localUrl]);

  useEffect(() => {
    const keys = new Set(
      rows.flatMap((row) => (row.kind === "post" && row.author.isYou ? [row.clientKey] : [])),
    );
    if (!posts.some((post) => keys.has(post.clientKey))) return;
    for (const post of posts) {
      if (!keys.has(post.clientKey)) continue;
      for (const file of post.files) {
        const url = resources.current.get(file.blob);
        if (url) URL.revokeObjectURL(url);
        resources.current.delete(file.blob);
      }
      void removeMedia(scope, post.clientKey).catch(() =>
        setError("Couldn't clear a delivered attachment from this device. Retry is safe."),
      );
    }
    void Promise.resolve().then(() =>
      setPosts((current) => current.filter((post) => !keys.has(post.clientKey))),
    );
  }, [rows, posts, scope]);

  function update(key: string, patch: Delivery) {
    if (active())
      setPosts((current) =>
        current.map((post) => (post.clientKey === key ? { ...post, ...patch } : post)),
      );
  }
  async function uploadAndSend(post: Pending, token: string | null, signal: AbortSignal) {
    if (!token) throw new Error("Sign in again to send attachments.");
    const attachments: Upload[] = [];
    for (const file of post.files) {
      // eslint-disable-next-line react-doctor/async-await-in-loop -- Intentional because serial uploads bound buffering and preserve attachment order.
      attachments.push(await uploadMedia(file, token, signal));
      signal.throwIfAborted();
    }
    signal.throwIfAborted();
    return send({ groupId: group.groupId, clientKey: post.clientKey, body: "", attachments });
  }
  async function deliver(post: Pending) {
    const controller = availableController(
      operation.current,
      lifetime,
      inFlight.current,
      post.clientKey,
    );
    if (!controller) return;
    const stillOwned = () => !controller.signal.aborted && !lifetime.aborted;
    inFlight.current.add(post.clientKey);
    update(post.clientKey, { status: "sending", receipt: null });
    try {
      // Persist first on every retry too: quota failure cannot silently lose the bytes.
      await saveMedia(scope, {
        clientKey: post.clientKey,
        createdAt: post.createdAt,
        files: post.files,
      }).catch(() => {
        throw new Error(
          "Couldn't save unsent attachments on this device. Keep this tab open to retry.",
        );
      });
      if (!navigator.onLine) {
        update(post.clientKey, { status: "queued", receipt: null });
        return;
      }
      const token = await fetchAccessToken({ forceRefreshToken: false });
      if (!stillOwned()) return;
      const receipt = await uploadAndSend(post, token, controller.signal);
      if (!stillOwned()) return;
      update(post.clientKey, { status: "sent", receipt });
      await removeMedia(scope, post.clientKey);
    } catch (cause) {
      if (!stillOwned()) return;
      update(post.clientKey, { status: "failed", receipt: null });
      setError(deliveryError(cause));
    } finally {
      inFlight.current.delete(post.clientKey);
    }
  }
  // eslint-disable-next-line react-doctor/no-fetch-in-effect -- False positive because this effect only installs an online listener; the event starts delivery.
  useEffect(() => {
    const resume = () => {
      for (const post of posts) if (post.status === "queued") void deliver(post);
    };
    window.addEventListener("online", resume);
    return () => window.removeEventListener("online", resume);
  });
  function enqueue(files: readonly Media[]) {
    if (!active()) return;
    const post: Pending = {
      clientKey: crypto.randomUUID(),
      createdAt: Date.now(),
      files,
      previews: files.map((file) => localAttachment(file, localUrl(file.blob))),
      status: "sending",
      receipt: null,
      afterSequence: group.lastSequence,
    };
    setPosts((current) => [...current, post]);
    setError("");
    void deliver(post);
  }
  const messages: PostView[] = posts
    .filter(
      (post) =>
        !committed.has(post.clientKey) &&
        !rows.some((row) => row.id === post.receipt?.messageId) &&
        (post.status !== "sent" || post.receipt.sequence > post.afterSequence),
    )
    .map((post, index) => ({
      kind: "post",
      id: post.receipt?.messageId ?? post.clientKey,
      renderKey: post.clientKey,
      sequence: post.receipt?.sequence ?? group.lastSequence + index + 1,
      createdAt: post.createdAt,
      author: { ...me, avatar: { ...me.avatar, photoUrl: null } },
      body: "",
      mentions: [],
      attachments: post.previews,
      replyTo: null,
      reactions: [],
      editedAt: null,
      ...pendingState(post, connection.isWebSocketConnected),
    }));
  return {
    messages,
    enqueue,
    error,
    setError,
    retry: (key: string) => {
      const post = posts.find((item) => item.clientKey === key);
      if (post && post.status !== "sent") {
        setError("");
        void deliver(post);
      }
    },
  };
}
