import { api } from "@q9chat/convex";
import { messageSummary } from "@q9chat/domain";
import { useConvexConnectionState } from "convex/react";
import * as Clipboard from "expo-clipboard";
import { useRef, useState } from "react";

import type { ComposerMode } from "../kit/Composer";
import { useToast } from "../kit/useToast";
import type { Emoji } from "../types";
import type { HistoryRow } from "./historyRows";
import { phoneWrite } from "./phoneWrite";
import type { Reply } from "./textState";
import type { useTextOutbox } from "./useTextOutbox";

type Post = Extract<HistoryRow, { kind: "post" }>;
export type ActionSheet = { kind: "message" | "delete" | "report" | "reactions"; post: Post };
type Composition =
  | { kind: "compose" }
  | { kind: "reply"; reply: Reply }
  | { kind: "edit"; post: Post; draft: string };

export function useMessageActions(
  rows: readonly HistoryRow[],
  text: ReturnType<typeof useTextOutbox>,
) {
  const [toast, showToast] = useToast();
  const [sheet, setSheet] = useState<ActionSheet | null>(null);
  const [composition, setComposition] = useState<Composition>({ kind: "compose" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const { isWebSocketConnected: connected } = useConvexConnectionState();
  async function write(action: Parameters<typeof phoneWrite<null>>[0], done: () => void) {
    if (busy.current) return;
    if (!connected) {
      setError("You're offline. Try again when you're back.");
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await phoneWrite(action);
      done();
    } catch {
      setError("Couldn't save this change. Try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  function postOf(id: string) {
    return rows.find((row): row is Post => row.id === id && row.kind === "post");
  }
  function close() {
    if (!busy.current) setSheet(null);
  }
  function react(id: string, emoji: Emoji) {
    const post = postOf(id);
    if (!post) return;
    const remove = post.reactions.some((reaction) => reaction.emoji === emoji && reaction.mine);
    void write(
      (client) =>
        client.mutation(api.messages.react, { messageId: post.id, emoji: remove ? null : emoji }),
      () => setSheet(null),
    );
  }
  const mode: ComposerMode =
    composition.kind === "edit"
      ? { kind: "edit" }
      : composition.kind === "reply"
        ? { kind: "reply", author: composition.reply.author, summary: composition.reply.summary }
        : { kind: "compose" };
  return {
    sheet,
    pending,
    error,
    mode,
    toast,
    open(id: string, kind: ActionSheet["kind"] = "message") {
      const post = postOf(id);
      if (post) {
        setError("");
        setSheet({ kind, post });
      }
    },
    close,
    react,
    reply(post: Post) {
      setComposition({
        kind: "reply",
        reply: {
          messageId: post.id,
          sequence: post.sequence,
          author: post.author.name,
          summary: messageSummary(post),
        },
      });
      setSheet(null);
    },
    edit(post: Post) {
      setComposition({ kind: "edit", post, draft: post.body });
      setSheet(null);
    },
    copy(post: Post) {
      void Clipboard.setStringAsync(post.body).then(
        () => setSheet(null),
        () => setError("Couldn't copy the message. Try again."),
      );
    },
    remove(post: Post) {
      void write(
        (client) => client.mutation(api.messages.remove, { messageId: post.id }),
        () => setSheet(null),
      );
    },
    report(post: Post, reason: "spam" | "harassment" | "other") {
      void write(
        (client) => client.mutation(api.reports.create, { messageId: post.id, reason }),
        () => {
          setSheet(null);
          showToast("Thanks. We'll review this message.");
        },
      );
    },
    cancel() {
      if (!busy.current) {
        setComposition({ kind: "compose" });
        setError("");
      }
    },
    draft: composition.kind === "edit" ? composition.draft : text.draft,
    change(draft: string) {
      if (composition.kind === "edit") setComposition({ ...composition, draft });
      else text.change(draft);
    },
    submit(onSent: () => void) {
      if (composition.kind === "edit") {
        if (!composition.draft.trim() || composition.draft.length > 4000) {
          setError("Use 1 to 4,000 characters.");
          return;
        }
        void write(
          (client) =>
            client.mutation(api.messages.edit, {
              messageId: composition.post.id,
              body: composition.draft,
            }),
          () => setComposition({ kind: "compose" }),
        );
      } else if (text.submit(composition.kind === "reply" ? composition.reply : undefined)) {
        setComposition({ kind: "compose" });
        onSent();
      }
    },
    attachmentReply: composition.kind === "reply" ? composition.reply : undefined,
    sentAttachment() {
      setComposition({ kind: "compose" });
    },
  };
}
