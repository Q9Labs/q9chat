import { Fragment, useState, type ReactNode } from "react";

import { Avatar } from "../ui/avatar.js";
import { Icon } from "../ui/icons.js";
import { Menu, MenuItem, MenuSeparator } from "../ui/overlay.js";
import { FileCard, ImageTile, VoiceRow } from "./attachments.js";
import { clockTime, reactorNames } from "./format.js";
import type { RunMessage } from "./timeline.js";
import {
  EMOJIS,
  type Author,
  type DeletedView,
  type Emoji,
  type PostView,
  type Reaction,
  type ReplyTo,
  type SendState,
} from "./types.js";

// The eight fixed avatar colors and the lightened name color used in dark mode.
const AVATAR_COLORS: Readonly<Record<string, string>> = {
  "#0369a1": "#38bdf8",
  "#be185d": "#f472b6",
  "#b45309": "#fbbf24",
  "#0f766e": "#2dd4bf",
  "#6d28d9": "#a78bfa",
  "#c2410c": "#fb923c",
  "#4d7c0f": "#a3e635",
  "#b91c1c": "#f87171",
};

const TOKEN = /(https?:\/\/\S+)|@([\p{L}\p{N}_]+)/gu;

/** Body text with links underlined and `@Name` mentions in the accent color. */
function Body({ text, mentions }: { readonly text: string; readonly mentions: readonly string[] }) {
  const known = new Set(mentions.map((name) => name.toLowerCase()));
  const out: ReactNode[] = [];
  let at = 0;
  for (const hit of text.matchAll(TOKEN)) {
    const start = hit.index;
    if (start > at) out.push(<Fragment key={`t${at}`}>{text.slice(at, start)}</Fragment>);
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
      out.push(<Fragment key={start}>{hit[0]}</Fragment>);
    }
    at = start + hit[0].length;
  }
  if (at < text.length) out.push(<Fragment key={`t${at}`}>{text.slice(at)}</Fragment>);
  return out;
}

/** A thin accent bar with the original sender and a one-line summary. No box. */
function QuoteBar({
  reply,
  onOpen,
  readOnly,
}: {
  readonly reply: ReplyTo;
  readonly onOpen: () => void;
  readonly readOnly: boolean;
}) {
  if (reply.deleted === true) {
    return (
      <button
        type="button"
        className="quote"
        disabled={readOnly}
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
      disabled={readOnly}
      aria-label={`Quoted message from ${who}. Go to it.`}
      onClick={onOpen}
    >
      <b>{who}</b>
      <span>{reply.summary}</span>
    </button>
  );
}

/** Borderless reaction pills on a soft fill with a count; your own carries the accent wash. */
function reactionPeople(reaction: Reaction) {
  const names = reactorNames(reaction.people);
  const others = reaction.count - reaction.people.length;
  if (others <= 0) return names;
  return `${names}${names ? " and " : ""}${others} ${others === 1 ? "other" : "others"}`;
}

function ReactionPills({
  reactions,
  mine,
  onToggle,
  readOnly,
  onInspect,
}: {
  readonly onInspect: () => void;
  readonly reactions: readonly Reaction[];
  readonly mine: boolean;
  readonly onToggle: (emoji: Emoji) => void;
  readonly readOnly: boolean;
}) {
  const shown = EMOJIS.flatMap((emoji) =>
    reactions.filter((reaction) => reaction.emoji === emoji && reaction.count > 0),
  );
  if (shown.length === 0) return null;
  return (
    <div className="rx">
      {shown.map((reaction) => {
        const who = reactionPeople(reaction);
        return (
          <button
            key={reaction.emoji}
            type="button"
            className={`chip${reaction.mine ? " me" : ""}`}
            disabled={readOnly}
            onMouseEnter={onInspect}
            onFocus={onInspect}
            aria-pressed={reaction.mine}
            aria-label={
              readOnly
                ? `${reaction.emoji} ${reaction.count} reactions`
                : `${reaction.emoji} ${reaction.count}: ${who}`
            }
            data-tip={readOnly ? undefined : `${who} reacted with ${reaction.emoji}`}
            data-tip-side={mine ? "start" : "end"}
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
  readonly onInspectReactions?: (message: PostView) => void;
  readonly onReact: (message: PostView, emoji: Emoji) => void;
  readonly onReply: (message: PostView) => void;
  readonly onEdit: (message: PostView) => void;
  readonly onCopy: (message: PostView) => void;
  readonly onDelete: (message: PostView) => void;
  readonly onReport: (message: PostView) => void;
  readonly onRetry: (message: PostView) => void;
  readonly onOpenQuote: (reply: ReplyTo) => void;
  readonly onMediaError: (error: string, owner: string) => void;
  readonly onMenuOpenChange: (message: RunMessage, open: boolean) => void;
}

interface MessageProps {
  readonly readOnly?: boolean;
  readonly message: RunMessage;
  readonly timeZone: string | undefined;
  /** The timeline is narrow: the five reactions move into the More menu. */
  readonly compact: boolean;
  /** Brief highlight after a jump or an edit by someone else. */
  readonly highlighted?: boolean;
  readonly menuOpen: boolean;
  readonly handlers: MessageHandlers;
}

function messageClass(sendState: SendState | undefined, highlighted: boolean, menuOpen: boolean) {
  const flags = ["msg", sendState ?? "", highlighted ? "flash" : "", menuOpen ? "menu-open" : ""];
  return flags.filter(Boolean).join(" ");
}

function DeletedMessage({
  message,
  highlighted,
}: {
  readonly message: DeletedView;
  readonly highlighted: boolean;
}) {
  return (
    <div
      className={messageClass(undefined, highlighted, false)}
      id={`m-${message.id}`}
      data-sequence={message.sequence}
    >
      <div className="bub gone">
        <span className="del">
          <Icon name="ban" />
          {message.author.isYou ? "You deleted this message" : "Message deleted"}
        </span>
      </div>
    </div>
  );
}

/** The bubble: a quote, then the text with its "edited" tag. Attachment-only messages have none. */
function Bubble({
  message,
  onOpenQuote,
  readOnly,
}: {
  readonly message: PostView;
  readonly onOpenQuote: (reply: ReplyTo) => void;
  readonly readOnly: boolean;
}) {
  const reply = message.replyTo;
  const hasText = message.body !== "";
  if (reply === null && !hasText) return null;
  return (
    <div className="bub">
      {reply === null ? null : (
        <QuoteBar reply={reply} onOpen={() => onOpenQuote(reply)} readOnly={readOnly} />
      )}
      {hasText ? (
        <div className="txt">
          <Body text={message.body} mentions={message.mentions} />
          {message.editedAt === null ? null : <span className="ed">edited</span>}
        </div>
      ) : null}
    </div>
  );
}

function Attachments({
  message,
  onMediaError,
}: {
  readonly message: PostView;
  readonly onMediaError: (error: string, owner: string) => void;
}) {
  // Slots are immutable within a post, including optimistic-to-live reconciliation.
  return message.attachments.map((attachment, index) => {
    const slot = `${message.renderKey ?? message.id}:${index}`;
    // Safe because attachment slots never reorder within a message.
    // react-doctor-disable-next-line react-doctor/no-array-index-as-key
    if (attachment.kind === "image") return <ImageTile key={slot} image={attachment} />;
    // Safe because attachment slots never reorder within a message.
    // react-doctor-disable-next-line react-doctor/no-array-index-as-key
    if (attachment.kind === "file") return <FileCard key={slot} file={attachment} />;
    return (
      // Safe because attachment slots never reorder within a message.
      // react-doctor-disable-next-line react-doctor/no-array-index-as-key
      <VoiceRow key={slot} voice={attachment} onError={(error) => onMediaError(error, slot)} />
    );
  });
}

function SendStatus({
  sendState,
  onRetry,
}: {
  readonly sendState: SendState | undefined;
  readonly onRetry: () => void;
}) {
  if (sendState === undefined) return null;
  if (sendState === "failed") {
    return (
      <span className="mst fail">
        <Icon name="alert" />
        Not sent ·{" "}
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </span>
    );
  }
  return (
    <span className="mst">
      <Icon name="clock" />
      {sendState === "sending" ? "Sending" : "Waiting for connection"}
    </span>
  );
}

/** The floating time and action bar beside a sent bubble. */
function ActionBar({
  message,
  time,
  menuOpen,
  moreRef,
  handlers,
}: {
  readonly message: PostView;
  readonly time: string;
  readonly menuOpen: boolean;
  readonly moreRef: (button: HTMLButtonElement | null) => void;
  readonly handlers: MessageHandlers;
}) {
  return (
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
        <span className="avatar-spacer" />
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
          ref={moreRef}
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
  );
}

/** Edit (your own text only), Copy text, then a separator. */
function TextActions({
  message,
  editable,
  handlers,
}: {
  readonly message: PostView;
  readonly editable: boolean;
  readonly handlers: MessageHandlers;
}) {
  return (
    <>
      {editable ? (
        <MenuItem icon="pencil" onSelect={() => handlers.onEdit(message)}>
          Edit
        </MenuItem>
      ) : null}
      <MenuItem icon="copy" onSelect={() => handlers.onCopy(message)}>
        Copy text
      </MenuItem>
      <MenuSeparator />
    </>
  );
}

/** The five reactions as a menu row, for a narrow timeline. */
function ReactionRow({
  message,
  onReact,
}: {
  readonly message: PostView;
  readonly onReact: MessageHandlers["onReact"];
}) {
  return (
    <>
      <fieldset className="memo" aria-label="React">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitem"
            aria-label={`React with ${emoji}`}
            onClick={() => onReact(message, emoji)}
          >
            {emoji}
          </button>
        ))}
      </fieldset>
      <MenuSeparator />
    </>
  );
}

function MessageMenu({
  message,
  anchor,
  compact,
  handlers,
}: {
  readonly message: PostView;
  readonly anchor: HTMLButtonElement | null;
  readonly compact: boolean;
  readonly handlers: MessageHandlers;
}) {
  const mine = message.author.isYou;
  const hasText = message.body !== "";
  const editable = mine && hasText && message.attachments.length === 0;
  return (
    <Menu
      label="Message actions"
      anchor={anchor}
      onClose={() => handlers.onMenuOpenChange(message, false)}
    >
      {compact ? <ReactionRow message={message} onReact={handlers.onReact} /> : null}
      <MenuItem icon="reply" onSelect={() => handlers.onReply(message)}>
        Reply
      </MenuItem>
      {hasText ? <TextActions message={message} editable={editable} handlers={handlers} /> : null}
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
  );
}

/** The action bar and its More menu share the button the menu anchors to. */
function MessageActions({
  message,
  time,
  compact,
  menuOpen,
  handlers,
}: {
  readonly message: PostView;
  readonly time: string;
  readonly compact: boolean;
  readonly menuOpen: boolean;
  readonly handlers: MessageHandlers;
}) {
  const [more, setMore] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <ActionBar
        message={message}
        time={time}
        menuOpen={menuOpen}
        moreRef={setMore}
        handlers={handlers}
      />
      {menuOpen ? (
        <MessageMenu message={message} anchor={more} compact={compact} handlers={handlers} />
      ) : null}
    </>
  );
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
  handlers,
  readOnly: screenReadOnly = false,
}: MessageProps) {
  if (message.kind === "deleted") {
    return <DeletedMessage message={message} highlighted={highlighted} />;
  }
  const sendState = message.sendState;
  const readOnly = screenReadOnly || message.actionsDisabled === true;
  return (
    <div
      className={messageClass(sendState, highlighted, menuOpen)}
      id={`m-${message.id}`}
      data-sequence={sendState === undefined ? message.sequence : undefined}
    >
      <Bubble message={message} onOpenQuote={handlers.onOpenQuote} readOnly={readOnly} />
      {message.attachmentLabels?.map(({ id, label }) => (
        <div className="file" key={id}>
          {label}
        </div>
      ))}
      <Attachments message={message} onMediaError={handlers.onMediaError} />
      <ReactionPills
        onInspect={() => handlers.onInspectReactions?.(message)}
        readOnly={readOnly}
        reactions={message.reactions}
        mine={message.author.isYou}
        onToggle={(emoji) => handlers.onReact(message, emoji)}
      />
      <SendStatus sendState={sendState} onRetry={() => handlers.onRetry(message)} />
      {sendState === undefined && !readOnly ? (
        <MessageActions
          message={message}
          time={clockTime(message.createdAt, timeZone)}
          compact={compact}
          menuOpen={menuOpen}
          handlers={handlers}
        />
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
        <div className="message-column">
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
        aria-label={`About ${author.name}`}
        onClick={() => onOpenAuthor(author)}
      >
        <Avatar avatar={author.avatar} />
      </button>
      <div className="message-column">
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
