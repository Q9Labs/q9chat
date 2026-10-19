import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { useConvexConnectionState } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { useEffect, useState, useSyncExternalStore } from "react";

import { sessionClient } from "../session/client";
import { config } from "../session/config";
import { keepAttachment, uploadAttachment } from "./attachments";
import { normalizeText, type LocalAttachment, type Pending } from "./textState";
import { textStore } from "./textStore";

type Group = Extract<FunctionReturnType<typeof api.groups.get>, { status: "member" }>;
type Row = FunctionReturnType<typeof api.messages.range>[number];

export function useTextOutbox(group: Group, rows: readonly Row[]) {
  const me = group.members.find((person) => person.isYou);
  if (!me) throw new Error("Member query did not include the caller");
  const store = textStore(me.id, group.groupId);
  const [openingSequence] = useState(group.lastSequence);
  const state = useSyncExternalStore(store.subscribe, store.get);
  const { isWebSocketConnected: connected } = useConvexConnectionState();
  const committed = new Set(
    rows.flatMap((row) => (row.kind === "post" && row.author.isYou ? [row.clientKey] : [])),
  );
  type StoredPost = (typeof state.pending)[number];
  const retain = (post: StoredPost) =>
    !committed.has(post.clientKey) && (post.status !== "sent" || post.sequence > openingSequence);
  const pending = state.pending.filter(retain);
  function discardAttachment(post: StoredPost) {
    if (!post.attachment) return;
    try {
      const file = new File(post.attachment.uri);
      if (file.exists) file.delete();
    } catch {
      store.error("Message sent, but the local attachment couldn't be cleared.");
    }
  }
  useEffect(() => {
    if (pending.length === state.pending.length) return;
    const current = store.get();
    const retained = current.pending.filter(retain);
    if (!store.update({ ...current, pending: retained })) return;
    const keys = new Set(retained.map((post) => post.clientKey));
    for (const post of current.pending) {
      if (!keys.has(post.clientKey)) discardAttachment(post);
    }
  });
  async function deliver(post: Pending) {
    const epoch = sessionClient.epoch();
    if (!connected) {
      const failed: Pending = { ...post, status: "failed" };
      store.update({
        ...store.get(),
        pending: store
          .get()
          .pending.map((item) => (item.clientKey === post.clientKey ? failed : item)),
      });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    const unsubscribe = sessionClient.subscribe(() => {
      if (sessionClient.epoch() !== epoch) controller.abort();
    });
    function replace(next: (typeof state.pending)[number]) {
      const current = store.get();
      store.update({
        ...current,
        pending: current.pending.map((item) => (item.clientKey === post.clientKey ? next : item)),
      });
    }
    try {
      const token = await sessionClient.fetchAccessToken({ forceRefreshToken: false });
      if (!token || sessionClient.epoch() !== epoch || controller.signal.aborted)
        throw new Error("Send interrupted");
      const client = new ConvexHttpClient(config.convexUrl, {
        auth: token,
        logger: false,
        fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
      });
      const receipt = await client.mutation(api.messages.send, {
        groupId: group.groupId,
        clientKey: post.clientKey,
        body: post.body,
        attachments: post.attachment
          ? [await uploadAttachment(post.attachment, token, controller.signal)]
          : [],
      });
      replace({ ...post, ...receipt, status: "sent" });
    } catch {
      replace({ ...post, status: "failed" });
    } finally {
      clearTimeout(timeout);
      unsubscribe();
    }
  }
  return {
    ...state,
    me,
    pending,
    notice: (message: string) => store.error(message),
    change(draft: string) {
      store.update({ ...store.get(), draft });
    },
    submit() {
      const current = store.get();
      const body = normalizeText(current.draft);
      if (!body.trim()) return false;
      if (body.length > 4000) {
        store.error("Use 4,000 characters or fewer.");
        return false;
      }
      const post: Pending = {
        clientKey: randomUUID(),
        body,
        createdAt: Date.now(),
        status: "sending",
      };
      if (!store.update({ draft: "", pending: [...current.pending, post] })) return false;
      void deliver(post);
      return true;
    },
    attach(attachment: LocalAttachment) {
      const key = randomUUID();
      try {
        const saved = keepAttachment(attachment, `${me.id}-${group.groupId}-${key}`);
        const post: Pending = {
          clientKey: key,
          body: "",
          attachment: saved,
          createdAt: Date.now(),
          status: "sending",
        };
        const current = store.get();
        if (!store.update({ ...current, pending: [...current.pending, post] })) return false;
        void deliver(post);
        return true;
      } catch (error) {
        store.error(
          error instanceof Error ? error.message : "Couldn't attach this file. Try again.",
        );
        return false;
      }
    },
    retry(this: void, id: string) {
      const post = store.get().pending.find((item) => item.clientKey === id);
      if (!post || post.status !== "failed") return;
      const sending: Pending = { ...post, status: "sending" };
      if (
        !store.update({
          ...store.get(),
          pending: store.get().pending.map((item) => (item.clientKey === id ? sending : item)),
        })
      )
        return;
      void deliver(sending);
    },
  };
}
