import { api } from "@q9chat/convex";
import { useConvex, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Either, Schema } from "effect";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { PostView } from "../chat/types.js";
import { transportLifetime } from "../lib/convex.js";
import { journeyError } from "./group-errors.js";

const PendingText = Schema.Struct({
  clientKey: Schema.String,
  body: Schema.String,
  createdAt: Schema.Number,
  status: Schema.Literal("sending", "failed"),
});
interface TextState {
  readonly draft: string;
  readonly pending: readonly (Pending | Delivered)[];
}
type Pending = typeof PendingText.Type;
type Delivered = Omit<Pending, "status"> & { readonly status: "sent" } & FunctionReturnType<
    typeof api.messages.send
  >;
function withStatus(post: Pending | Delivered, status: Pending["status"]): Pending {
  return { clientKey: post.clientKey, body: post.body, createdAt: post.createdAt, status };
}
type Group = Extract<FunctionReturnType<typeof api.groups.get>, { status: "member" }>;
type Row = FunctionReturnType<typeof api.messages.range>[number];
export const normalizeText = (body: string) => body.replace(/\s+$/, "");
const bodyLimitCopy = "Use 4,000 characters or fewer.";

function restorePending(key: string, name: string): Pending | null {
  const raw = localStorage.getItem(name);
  const decoded = Schema.decodeUnknownEither(Schema.parseJson(PendingText))(raw);
  const prefix = `${key}:pending:`;
  if (Either.isRight(decoded) && name === `${prefix}${decoded.right.clientKey}`)
    return withStatus(decoded.right, "failed");
  // Preserve the damaged value for recovery, but never let it poison another reload.
  localStorage.setItem(`${key}:quarantine:${name.slice(prefix.length)}`, raw ?? "");
  localStorage.removeItem(name);
  return null;
}

function loadText(key: string): { readonly text: TextState; readonly error: string } {
  try {
    const draft = sessionStorage.getItem(`${key}:draft`) ?? "";
    const prefix = `${key}:pending:`;
    const pending: Pending[] = [];
    let damaged = false;
    for (const name of Object.keys(localStorage).filter((candidate) =>
      candidate.startsWith(prefix),
    )) {
      const restored = restorePending(key, name);
      if (restored) pending.push(restored);
      else damaged = true;
    }
    return {
      text: { draft, pending: pending.toSorted((a, b) => a.createdAt - b.createdAt) },
      error: damaged ? "Couldn't restore one or more unsent messages on this device." : "",
    };
  } catch {
    return {
      text: { draft: "", pending: [] },
      error: "Couldn't restore unsent messages on this device.",
    };
  }
}

function textStore(key: string) {
  let snapshot = { ...loadText(key), saveError: "", failure: { id: 0, text: "" } };
  let delivery = {
    pending: snapshot.text.pending,
    error: snapshot.error,
    saveError: snapshot.saveError,
    failure: snapshot.failure,
  };
  const listeners = new Set<() => void>();
  const inFlight = new Set<string>();
  function publish() {
    if (
      delivery.pending !== snapshot.text.pending ||
      delivery.error !== snapshot.error ||
      delivery.saveError !== snapshot.saveError ||
      delivery.failure !== snapshot.failure
    ) {
      delivery = {
        pending: snapshot.text.pending,
        error: snapshot.error,
        saveError: snapshot.saveError,
        failure: snapshot.failure,
      };
    }
    for (const listener of listeners) listener();
  }
  return {
    inFlight,
    get: () => snapshot,
    getDelivery: () => delivery,
    getDraft: () => snapshot.text.draft,
    failed: () => {
      snapshot = {
        ...snapshot,
        failure: { id: snapshot.failure.id + 1, text: "Message not sent. Retry." },
      };
      publish();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    error: (error: string) => {
      snapshot = { ...snapshot, error };
      publish();
    },
    update: (text: TextState) => {
      const previous = snapshot.text;
      snapshot = { ...snapshot, text };
      try {
        for (const post of text.pending) {
          const postKey = `${key}:pending:${post.clientKey}`;
          if (post.status === "sent") localStorage.removeItem(postKey);
          else localStorage.setItem(postKey, JSON.stringify(post));
        }
        if (previous.draft !== text.draft) sessionStorage.setItem(`${key}:draft`, text.draft);
        for (const post of previous.pending) {
          if (!text.pending.some((item) => item.clientKey === post.clientKey))
            localStorage.removeItem(`${key}:pending:${post.clientKey}`);
        }
        snapshot = { ...snapshot, saveError: "" };
      } catch {
        snapshot = {
          ...snapshot,
          saveError: "Couldn't save unsent messages on this device. Keep this tab open to retry.",
        };
      }
      publish();
    },
  };
}
const stores = new Map<string, ReturnType<typeof textStore>>();
function groupStore(key: string) {
  const existing = stores.get(key);
  if (existing) return existing;
  const store = textStore(key);
  stores.set(key, store);
  return store;
}

function replacePost(
  store: ReturnType<typeof textStore>,
  clientKey: string,
  replace: (post: Pending | Delivered) => Pending | Delivered,
) {
  const current = store.get().text;
  store.update({
    ...current,
    pending: current.pending.map((post) => (post.clientKey === clientKey ? replace(post) : post)),
  });
}

function receiptInWindow(post: Delivered, rows: readonly Row[], lastSequence: number) {
  const first = rows[0]?.sequence ?? 0;
  const last = rows.at(-1)?.sequence ?? lastSequence;
  return post.sequence >= first && post.sequence <= last + 1;
}

/** A durable key is allocated before transport; failed/restarted sends keep that same key. */
export function useTextOutbox(group: Group, rows: readonly Row[]) {
  const me = group.members.find((person) => person.isYou);
  if (!me) throw new Error("A member conversation requires its caller");
  const storageKey = `q9chat:text:${me.id}:${group.groupId}`;
  const [store] = useState(() => groupStore(storageKey));
  const {
    pending: savedPending,
    error,
    saveError,
    failure,
  } = useSyncExternalStore(store.subscribe, store.getDelivery, store.getDelivery);
  const lifetime = transportLifetime(useConvex());
  const [initialFailure] = useState(failure.id);
  const send = useMutation(api.messages.send);
  const { update, inFlight, error: setError } = store;

  // Retain the display copy until the live row arrives; acknowledgements independently retire durable retries.
  const committed = new Set(
    rows.flatMap((row) => (row.kind === "post" && row.author.isYou ? [row.clientKey] : [])),
  );
  const loadedIds = new Set(rows.map((row) => row.id));
  function notLoaded(post: Pending | Delivered) {
    if (committed.has(post.clientKey)) return false;
    if (post.status !== "sent") return true;
    // Only bridge the live-query delay where a row is expected, never replay cached old text.
    return !loadedIds.has(post.messageId) && receiptInWindow(post, rows, group.lastSequence);
  }
  const pending = savedPending.filter(notLoaded);
  useEffect(() => {
    if (pending.length !== savedPending.length) {
      const current = store.get().text;
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent -- Synchronizes committed keys to the external localStorage outbox, not parent React state.
      update({ ...current, pending: current.pending.filter(notLoaded) });
    }
  });

  const abandoned = () => lifetime.aborted;
  function failedSend(post: Pending, cause: unknown) {
    if (!store.get().text.pending.some((item) => item.clientKey === post.clientKey)) return;
    replacePost(store, post.clientKey, (item) => withStatus(item, "failed"));
    store.failed();
    const copy = journeyError(cause);
    setError(copy === "Couldn't complete that. Try again." ? "" : copy);
  }
  async function deliver(post: Pending) {
    if (abandoned() || inFlight.has(post.clientKey)) return;
    inFlight.add(post.clientKey);
    const abandon = () => {
      inFlight.delete(post.clientKey);
      replacePost(store, post.clientKey, (item) =>
        item.status === "sent" ? item : withStatus(item, "failed"),
      );
    };
    lifetime.addEventListener("abort", abandon, { once: true });
    update({
      ...store.get().text,
      pending: store
        .get()
        .text.pending.map((item) =>
          item.clientKey === post.clientKey ? withStatus(item, "sending") : item,
        ),
    });
    try {
      const receipt = await send({
        groupId: group.groupId,
        clientKey: post.clientKey,
        body: post.body,
        attachments: [],
      });
      if (abandoned()) return;
      const delivered: Delivered = { ...post, ...receipt, status: "sent" };
      replacePost(store, post.clientKey, () => delivered);
    } catch (cause) {
      if (abandoned()) return;
      failedSend(post, cause);
    } finally {
      lifetime.removeEventListener("abort", abandon);
      if (!abandoned()) inFlight.delete(post.clientKey);
    }
  }

  function submit() {
    const draft = store.get().text.draft;
    const body = normalizeText(draft);
    if (!body.trim()) return false;
    if (body.length > 4000) {
      setError(bodyLimitCopy);
      return false;
    }
    const post: Pending = {
      clientKey: crypto.randomUUID(),
      body,
      createdAt: Date.now(),
      status: "sending",
    };
    update({ draft: "", pending: [...store.get().text.pending, post] });
    setError("");
    void deliver(post);
    return true;
  }

  const messages: PostView[] = pending.map((post, index) => ({
    kind: "post",
    id: post.status === "sent" ? post.messageId : post.clientKey,
    renderKey: post.clientKey,
    sequence: post.status === "sent" ? post.sequence : group.lastSequence + index + 1,
    createdAt: post.createdAt,
    author: { ...me, avatar: { ...me.avatar, photoUrl: null } },
    body: post.body,
    mentions: [],
    attachments: [],
    replyTo: null,
    reactions: [],
    editedAt: null,
    ...(post.status === "sent" ? {} : { sendState: post.status }),
  }));
  return {
    composer: { subscribe: store.subscribe, getDraft: store.getDraft },
    failure: { ...failure, text: failure.id > initialFailure ? failure.text : "" },
    messages,
    error: saveError || error,
    submit,
    change: (draft: string) => {
      update({ ...store.get().text, draft });
      setError(normalizeText(draft).length > 4000 ? bodyLimitCopy : "");
    },
    retry: (id: string) => {
      const post = store.get().text.pending.find((item) => item.clientKey === id);
      if (post && post.status !== "sent") {
        setError("");
        void deliver(post);
      }
    },
  };
}
