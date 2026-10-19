import { api } from "@q9chat/convex";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Schema } from "effect";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { PostView } from "../chat/types.js";
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
const bodyLimitCopy = "Use 4,000 characters or fewer.";

function loadText(key: string): { readonly text: TextState; readonly error: string } {
  try {
    const draft = localStorage.getItem(`${key}:draft`) ?? "";
    const prefix = `${key}:pending:`;
    const pending = Object.keys(localStorage)
      .filter((name) => name.startsWith(prefix))
      .map((name) =>
        Schema.decodeUnknownSync(Schema.parseJson(PendingText))(localStorage.getItem(name)),
      )
      .toSorted((a, b) => a.createdAt - b.createdAt);
    const text = { draft, pending };
    return {
      text: { ...text, pending: text.pending.map((post) => withStatus(post, "failed")) },
      error: "",
    };
  } catch {
    return {
      text: { draft: "", pending: [] },
      error: "Couldn't restore unsent messages on this device.",
    };
  }
}

function textStore(key: string) {
  let snapshot = { ...loadText(key), saveError: "" };
  const listeners = new Set<() => void>();
  const inFlight = new Set<string>();
  function publish() {
    for (const listener of listeners) listener();
  }
  return {
    inFlight,
    get: () => snapshot,
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
        if (previous.draft !== text.draft) localStorage.setItem(`${key}:draft`, text.draft);
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

/** A durable key is allocated before transport; failed/restarted sends keep that same key. */
export function useTextOutbox(group: Group, rows: readonly Row[]) {
  const me = group.members.find((person) => person.isYou);
  if (!me) throw new Error("A member conversation requires its caller");
  const storageKey = `q9chat:text:${me.id}:${group.groupId}`;
  const [store] = useState(() => groupStore(storageKey));
  const { text, error, saveError } = useSyncExternalStore(store.subscribe, store.get, store.get);
  const send = useMutation(api.messages.send);
  const { update, inFlight, error: setError } = store;

  // Retain the display copy until the live row arrives; acknowledgements independently retire durable retries.
  const committed = new Set(
    rows.flatMap((row) => (row.kind === "post" && row.author.isYou ? [row.clientKey] : [])),
  );
  const loadedIds = new Set(rows.map((row) => row.id));
  function notLoaded(post: Pending | Delivered) {
    return (
      !committed.has(post.clientKey) && (post.status !== "sent" || !loadedIds.has(post.messageId))
    );
  }
  const pending = text.pending.filter(notLoaded);
  useEffect(() => {
    if (pending.length !== text.pending.length) {
      const current = store.get().text;
      // react-doctor-disable-next-line react-doctor/no-pass-data-to-parent -- Synchronizes committed keys to the external localStorage outbox, not parent React state.
      update({ ...current, pending: current.pending.filter(notLoaded) });
    }
  });

  async function deliver(post: Pending) {
    if (inFlight.has(post.clientKey)) return;
    inFlight.add(post.clientKey);
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
      const delivered: Delivered = { ...post, ...receipt, status: "sent" };
      update({
        ...store.get().text,
        pending: store
          .get()
          .text.pending.map((item) => (item.clientKey === post.clientKey ? delivered : item)),
      });
    } catch (cause) {
      if (!store.get().text.pending.some((item) => item.clientKey === post.clientKey)) return;
      update({
        ...store.get().text,
        pending: store
          .get()
          .text.pending.map((item) =>
            item.clientKey === post.clientKey ? withStatus(item, "failed") : item,
          ),
      });
      const copy = journeyError(cause);
      setError(copy === "Couldn't complete that. Try again." ? "" : copy);
    } finally {
      inFlight.delete(post.clientKey);
    }
  }

  function submit() {
    const draft = store.get().text.draft;
    const body = draft.replace(/\s+$/, "");
    if (!body.trim()) return false;
    if (draft.length > 4000) {
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
    draft: text.draft,
    messages,
    error: saveError || error,
    submit,
    change: (draft: string) => {
      update({ ...store.get().text, draft });
      setError(draft.length > 4000 ? bodyLimitCopy : "");
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
