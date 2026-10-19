import { api } from "@q9chat/convex";
import { messageSummary } from "@q9chat/domain";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";

import type { ComposerMode } from "../chat/composer.js";
import type { MessageHandlers } from "../chat/message.js";
import type { PostView } from "../chat/types.js";
import { DeleteMessageDialog, ReportDialog } from "../screens/dialogs.js";
import { Toast } from "../ui/overlay.js";
import { journeyError } from "./group-errors.js";
import type { QuotedReply } from "./quoted-reply.js";

type Row = FunctionReturnType<typeof api.messages.range>[number];
type Post = Extract<Row, { kind: "post" }>;
type Mode =
  | { readonly type: "reply"; readonly quote: QuotedReply }
  | { readonly type: "edit"; readonly post: Post; readonly draft: string };
type Reason = FunctionArgs<typeof api.reports.create>["reason"];

function useActionFeedback(onError: (error: string) => void) {
  const [error, setActionError] = useState("");
  function setError(copy: string) {
    setActionError(copy);
    onError(copy);
  }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return () => {};
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  async function perform(action: () => Promise<unknown>, done = () => {}) {
    if (busy) return;
    if (!navigator.onLine) {
      setError("You're offline. Reconnect and try again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action();
      done();
    } catch (cause) {
      setError(journeyError(cause));
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, notice, setError, setNotice, perform };
}

function composerMode(mode: Mode | null): ComposerMode | null {
  return mode?.type === "reply"
    ? {
        type: "reply",
        to: mode.quote.author.isYou ? "yourself" : mode.quote.author.name,
        summary: mode.quote.summary,
      }
    : mode?.type === "edit"
      ? { type: "edit" }
      : null;
}

function useMessageComposer(
  rows: readonly Row[],
  perform: ReturnType<typeof useActionFeedback>["perform"],
  atLatest: boolean,
) {
  const edit = useMutation(api.messages.edit);
  const [mode, setMode] = useState<Mode | null>(null);
  function startEdit(post: Post) {
    setMode({ type: "edit", post, draft: post.body });
  }
  return {
    composerMode: composerMode(mode),
    reply: (post: Post) =>
      setMode({
        type: "reply",
        quote: {
          id: post.id,
          sequence: post.sequence,
          author: post.author,
          summary: messageSummary(post),
        },
      }),
    edit: startEdit,
    cancelDeleted: (id: string) => {
      if (mode?.type === "edit" && mode.post.id === id) setMode(null);
    },
    quote: mode?.type === "reply" ? mode.quote : undefined,
    editDraft: mode?.type === "edit" ? mode.draft : undefined,
    changeEdit: (draft: string) => {
      if (mode?.type === "edit") setMode({ ...mode, draft });
    },
    cancel: () => setMode(null),
    save: () => {
      if (mode?.type === "edit")
        void perform(
          () => edit({ messageId: mode.post.id, body: mode.draft.trimEnd() }),
          () => setMode((current) => (current === mode ? null : current)),
        );
    },
    editLast: () => {
      if (!atLatest || mode?.type === "edit") return;
      const post = rows.findLast(
        (row): row is Post =>
          row.kind === "post" &&
          row.author.isYou &&
          row.body !== "" &&
          row.attachments.length === 0,
      );
      if (post) startEdit(post);
    },
  };
}

function useMessageModeration(
  feedback: ReturnType<typeof useActionFeedback>,
  cancelDeleted: (id: string) => void,
) {
  const { error, busy, perform, setNotice } = feedback;
  const remove = useMutation(api.messages.remove);
  const report = useMutation(api.reports.create);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [reporting, setReporting] = useState<Post | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  return {
    delete: (post: Post | null) => setDeleting(post),
    report: (post: Post | null) => {
      setReason(null);
      setReporting(post);
    },
    covered: deleting !== null || reporting !== null,
    dialogs: (
      <>
        {deleting ? (
          <DeleteMessageDialog
            error={error}
            pending={busy}
            onClose={() => {
              if (!busy) setDeleting(null);
            }}
            onConfirm={() => {
              void perform(
                () => remove({ messageId: deleting.id }),
                () => {
                  setDeleting(null);
                  cancelDeleted(deleting.id);
                },
              );
            }}
          />
        ) : null}
        {reporting ? (
          <ReportDialog
            error={error}
            busy={busy}
            authorName={reporting.author.name}
            reason={reason}
            onReasonChange={setReason}
            onClose={() => {
              if (!busy) setReporting(null);
            }}
            onSend={() => {
              if (reason)
                void perform(
                  () => report({ messageId: reporting.id, reason }),
                  () => {
                    setReporting(null);
                    setNotice("Report sent. Thank you for letting us know.");
                  },
                );
            }}
          />
        ) : null}
      </>
    ),
  };
}

function useReactionPeople() {
  const [inspected, inspect] = useState<Post | null>(null);
  const reactors = useQuery(
    api.messages.reactors,
    inspected ? { messageId: inspected.id } : "skip",
  );
  return {
    inspect,
    people: (message: PostView) =>
      message.id === inspected?.id && reactors
        ? {
            ...message,
            reactions: message.reactions.map((r) => ({
              ...r,
              people: reactors.find((item) => item.emoji === r.emoji)?.people ?? [],
            })),
          }
        : message,
  };
}

export function useMessageActions(
  rows: readonly Row[],
  onError: (error: string) => void,
  atLatest: boolean,
) {
  const feedback = useActionFeedback(onError);
  const composer = useMessageComposer(rows, feedback.perform, atLatest);
  const moderation = useMessageModeration(feedback, composer.cancelDeleted);
  const people = useReactionPeople();
  const react = useMutation(api.messages.react);
  const [menu, setMenu] = useState<string | null>(null);
  const find = (message: PostView) =>
    rows.find((row): row is Post => row.kind === "post" && row.id === message.id);
  const handlers: Pick<
    MessageHandlers,
    | "onReply"
    | "onEdit"
    | "onDelete"
    | "onReport"
    | "onReact"
    | "onCopy"
    | "onMenuOpenChange"
    | "onInspectReactions"
  > = {
    onReply: (message) => {
      const post = find(message);
      if (!post) return;
      setMenu(null);
      composer.reply(post);
    },
    onEdit: (message) => {
      const post = find(message);
      setMenu(null);
      if (post) composer.edit(post);
    },
    onDelete: (message) => {
      feedback.setError("");
      setMenu(null);
      moderation.delete(find(message) ?? null);
    },
    onReport: (message) => {
      feedback.setError("");
      setMenu(null);
      moderation.report(find(message) ?? null);
    },
    onReact: (message, emoji) => {
      const post = find(message);
      if (!post) return;
      setMenu(null);
      void feedback.perform(() =>
        react({
          messageId: post.id,
          emoji: post.reactions.some((r) => r.emoji === emoji && r.mine) ? null : emoji,
        }),
      );
    },
    onCopy: (message) => {
      setMenu(null);
      void navigator.clipboard
        .writeText(message.body)
        .then(() => feedback.setNotice("Copied"))
        .catch(() => feedback.setError("Couldn't copy the text. Try again."));
    },
    onMenuOpenChange: (message, open) => setMenu(open ? message.id : null),
    onInspectReactions: (message) => people.inspect(find(message) ?? null),
  };
  return {
    ...composer,
    handlers,
    menu,
    busy: feedback.busy,
    readOnly: feedback.busy || composer.editDraft !== undefined,
    people: people.people,
    covered: moderation.covered,
    dialogs: (
      <>
        {feedback.notice ? <Toast message={feedback.notice} /> : null}
        {moderation.dialogs}
      </>
    ),
  };
}
