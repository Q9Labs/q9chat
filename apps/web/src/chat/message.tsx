import { Fragment, useState, type ReactNode } from "react";

import { AVATAR_COLORS, Avatar } from "../ui/avatar.js";
import { Icon } from "../ui/icons.js";
import { Menu, MenuItem, MenuSeparator } from "../ui/overlay.js";
import { FileCard, ImageTile, VoiceRow } from "./attachments.js";
import { clockTime, reactorNames } from "./format.js";
import type { RunMessage } from "./timeline.js";
import {
  EMOJIS,
  type Author,
  type Emoji,
  type PostView,
  type Reaction,
  type ReplyTo,
} from "./types.js";

const TOKEN = /(https?:\/\/\S+)|@([\p{L}\p{N}_]+)/gu;

/** Body text with links underlined and `@Name` mentions in the accent color. */
function Body({ text, mentions }: { readonly text: string; readonly mentions: readonly string[] }) {
  const known = new Set(mentions.map((name) => name.toLowerCase()));
  const out: ReactNode[] = [];
  let at = 0;
  for (const hit of text.matchAll(TOKEN)) {
    const start = hit.index;
    if (start > at) out.push(text.slice(at, start));
    const url = hit[1];
    const name = hit[2];
    if (url !== undefined) {
      out.push(
        <a key={start} className="lk" href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>,
      );
    } else if (name !== undefined && known.has(name.toLowerCase())) {
      out.push(
        <span key={start} className="mention">
          @{name}
        </span>,
      );
    } else {
      out.push(hit[0]);
    }
    at = start + hit[0].length;
  }
  if (at < text.length) out.push(text.slice(at));
  return out.map((part, index) =>
    typeof part === "string" ? <Fragment key={`t${index}`}>{part}</Fragment> : part,
  );
}

/** A thin accent bar with the original sender and a one-line summary. No box. */
export function QuoteBar({
  reply,
  onOpen,
}: {
  readonly reply: ReplyTo;
  readonly onOpen: () => void;
}) {
  if (reply.deleted === true) {
    return (
      <button
        type="button"
        className="quote"
        aria-label="Quoted message was deleted. Go to it."
        onClick={onOpen}
      >
        <span>Message deleted</span>
      </button>
    );
  }
  const who = reply.author.isYou ? "You" : reply.author.name;
  return (
    <button
      type="button"
      className="quote"
      aria-label={`Quoted message from ${who}. Go to it.`}
      onClick={onOpen}
    >
      <b>{who}</b>
      <span>{reply.summary}</span>
    </button>
  );
}

/** Borderless reaction pills on a soft fill with a count; your own carries the accent wash. */
export function ReactionPills({
  reactions,
  mine,
  onToggle,
}: {
  readonly reactions: readonly Reaction[];
  readonly mine: boolean;
  readonly onToggle: (emoji: Emoji) => void;
}) {
  const shown = EMOJIS.flatMap((emoji) =>
    reactions.filter((reaction) => reaction.emoji === emoji && reaction.count > 0),
  );
  if (shown.length === 0) return null;
  return (
    <div className="rx">
      {shown.map((reaction) => {
        const who = reactorNames(reaction.people);
        return (
          <button
            key={reaction.emoji}
            type="button"
            className={`chip${reaction.mine ? " me" : ""}`}
            aria-pressed={reaction.mine}
            aria-label={`${reaction.emoji} ${reaction.count}: ${who}`}
            data-tip={`${who} reacted with ${reaction.emoji}`}
            data-tipside={mine ? "start" : "end"}
            onClick={() => onToggle(reaction.emoji)}
          >
            <span className="e">{reaction.emoji}</span>
            {reaction.count}
          </button>
        );
      })}
    </div>
  );
}

export interface MessageHandlers {
  readonly onReact: (message: PostView, emoji: Emoji) => void;
  readonly onReply: (message: PostView) => void;
  readonly onEdit: (message: PostView) => void;
  readonly onCopy: (message: PostView) => void;
  readonly onDelete: (message: PostView) => void;
  readonly onReport: (message: PostView) => void;
  readonly onRetry: (message: PostView) => void;
  readonly onOpenQuote: (reply: ReplyTo) => void;
  readonly onTogglePlay: (message: PostView) => void;
  readonly onMenuOpenChange: (message: RunMessage, open: boolean) => void;
}

interface MessageProps {
  readonly message: RunMessage;
  readonly timeZone: string | undefined;
  /** The timeline is narrow: the five reactions move into the More menu. */
  readonly compact: boolean;
  /** Brief highlight after a jump or an edit by someone else. */
  readonly highlighted?: boolean;
  readonly menuOpen: boolean;
  /** 0 to 1 while this message's voice note plays. */
  readonly playProgress: number | null;
  readonly handlers: MessageHandlers;
}

/**
 * One message bubble with its quote, attachments, reactions, send state and the
 * hover action bar. The bar floats beside the bubble and never covers text.
 */
export function Message({
  message,
  timeZone,
  compact,
  highlighted = false,
  menuOpen,
  playProgress,
  handlers,
}: MessageProps) {
  const [more, setMore] = useState<HTMLButtonElement | null>(null);
  const mine = message.author.isYou;

  if (message.kind === "deleted") {
    return (
      <div className={`msg${highlighted ? " flash" : ""}`} id={`m-${message.id}`}>
        <div className="bub gone">
          <span className="del">
            <Icon name="ban" />
            {mine ? "You deleted this message" : "Message deleted"}
          </span>
        </div>
      </div>
    );
  }

  const sendState = message.sendState;
  const sent = sendState === undefined;
  const hasText = message.body !== "";
  const cls = [
    "msg",
    sent ? "" : sendState,
    highlighted ? "flash" : "",
    menuOpen ? "menuopen" : "",
  ];
  const reply = message.replyTo;
  const bubble = reply !== null || hasText;
  const editable = mine && hasText && message.attachments.length === 0;
  const time = clockTime(message.createdAt, timeZone);

  return (
    <div className={cls.filter(Boolean).join(" ")} id={`m-${message.id}`}>
      {bubble ? (
        <div className="bub">
          {reply === null ? null : (
            <QuoteBar reply={reply} onOpen={() => handlers.onOpenQuote(reply)} />
          )}
          {hasText ? (
            <div className="txt">
              <Body text={message.body} mentions={message.mentions} />
              {message.editedAt === null ? null : <span className="ed">edited</span>}
            </div>
          ) : null}
        </div>
      ) : null}
      {message.attachments.map((attachment, index) => {
        if (attachment.kind === "image") return <ImageTile key={index} image={attachment} />;
        if (attachment.kind === "file") return <FileCard key={index} file={attachment} />;
        return (
          <VoiceRow
            key={index}
            voice={attachment}
            progress={playProgress}
            onTogglePlay={() => handlers.onTogglePlay(message)}
          />
        );
      })}
      <ReactionPills
        reactions={message.reactions}
        mine={mine}
        onToggle={(emoji) => handlers.onReact(message, emoji)}
      />
      {sendState === "sending" ? (
        <span className="mst">
          <Icon name="clock" />
          Sending
        </span>
      ) : null}
      {sendState === "queued" ? (
        <span className="mst">
          <Icon name="clock" />
          Waiting for connection
        </span>
      ) : null}
      {sendState === "failed" ? (
        <span className="mst fail">
          <Icon name="alert" />
          Not sent ·{" "}
          <button type="button" onClick={() => handlers.onRetry(message)}>
            Retry
          </button>
        </span>
      ) : null}
      {sent ? (
        <div className="hz">
          <span className="mt">{time}</span>
          <div className="acts" role="toolbar" aria-label="Message actions">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="ab e"
                aria-label={`React with ${emoji}`}
                onClick={() => handlers.onReact(message, emoji)}
              >
                {emoji}
              </button>
            ))}
            <span className="asep" />
            <button
              type="button"
              className="ab"
              aria-label="Reply"
              data-tip="Reply"
              onClick={() => handlers.onReply(message)}
            >
              <Icon name="reply" />
            </button>
            <button
              ref={setMore}
              type="button"
              className="ab"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-tip="More"
              onClick={() => handlers.onMenuOpenChange(message, !menuOpen)}
            >
              <Icon name="more" />
            </button>
          </div>
        </div>
      ) : null}
      {menuOpen ? (
        <Menu
          label="Message actions"
          anchor={more}
          onClose={() => handlers.onMenuOpenChange(message, false)}
        >
          {compact ? (
            <>
              <div className="memo" role="group" aria-label="React">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    role="menuitem"
                    aria-label={`React with ${emoji}`}
                    onClick={() => handlers.onReact(message, emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <MenuSeparator />
            </>
          ) : null}
          {editable ? (
            <MenuItem icon="pencil" onSelect={() => handlers.onEdit(message)}>
              Edit
            </MenuItem>
          ) : null}
          {hasText ? (
            <MenuItem icon="copy" onSelect={() => handlers.onCopy(message)}>
              Copy text
            </MenuItem>
          ) : null}
          {editable || hasText ? <MenuSeparator /> : null}
          {mine ? (
            <MenuItem icon="trash" danger onSelect={() => handlers.onDelete(message)}>
              Delete
            </MenuItem>
          ) : (
            <MenuItem icon="flag" danger onSelect={() => handlers.onReport(message)}>
              Report
            </MenuItem>
          )}
        </Menu>
      ) : null}
    </div>
  );
}

/** One name, one avatar and one time per run of one person's messages. */
export function MessageRun({
  author,
  time,
  onOpenAuthor,
  children,
}: {
  readonly author: Author;
  readonly time: string;
  readonly onOpenAuthor: (author: Author) => void;
  readonly children: ReactNode;
}) {
  if (author.isYou) {
    return (
      <div className="mg mine">
        <div className="mcol">
          <div className="mh">{time}</div>
          {children}
        </div>
      </div>
    );
  }
  const color = author.avatar.color;
  const lighter = color === null ? undefined : (AVATAR_COLORS[color] ?? color);
  return (
    <div className="mg">
      <button
        type="button"
        className="avb"
        aria-label={`Open your group with ${author.name}`}
        onClick={() => onOpenAuthor(author)}
      >
        <Avatar avatar={author.avatar} />
      </button>
      <div className="mcol">
        <div className="mh">
          <button
            type="button"
            className="who"
            style={{ "--c": color ?? undefined, "--cl": lighter }}
            onClick={() => onOpenAuthor(author)}
          >
            {author.name}
          </button>
          {time}
        </div>
        {children}
      </div>
    </div>
  );
}
