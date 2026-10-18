import { splitMatches } from "../chat/format.js";
import { rowStamp } from "../chat/format.js";
import type { Me, PersonMatch, SearchHit } from "../chat/types.js";
import { Avatar } from "../ui/avatar.js";
import {
  Button,
  Field,
  FlatField,
  IconButton,
  LinkBox,
  PeopleChip,
  RadioList,
  TextInput,
} from "../ui/controls.js";
import { AppleMark, GoogleMark, Icon } from "../ui/icons.js";
import { Dialog, DialogActions } from "../ui/overlay.js";
import { useRoot } from "../ui/root.js";

// ---------- New group / Add people ----------

interface NewGroupDialogProps {
  readonly mode: "new" | "add";
  /** The group being added to, in add mode. */
  readonly groupTitle?: string;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly people: readonly PersonMatch[];
  readonly onRemovePerson: (person: PersonMatch) => void;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** Up to four matches for the query. */
  readonly suggestions: readonly PersonMatch[];
  readonly onPick: (person: PersonMatch) => void;
  /** A valid email that has no account, when the query is one. */
  readonly unknownEmail: string | null;
  /** In new mode with one person and no name: the pair already exists, so the action opens it. */
  readonly pairExists: boolean;
  readonly inviteToken: string;
  readonly linkCopied: boolean;
  readonly onCopyLink: () => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}

function primaryLabel(props: NewGroupDialogProps): string {
  const { mode, people, name, pairExists } = props;
  const first = people[0];
  if (mode === "add") {
    if (first === undefined) return "Add people";
    return people.length === 1 ? `Add ${first.name}` : `Add ${people.length} people`;
  }
  if (people.length === 1 && first !== undefined && name.trim() === "") {
    return pairExists ? `Open your group with ${first.name}` : `Start a group with ${first.name}`;
  }
  return "Create group";
}

/** Name the group, pick people by name or email, and share the link. */
export function NewGroupDialog(props: NewGroupDialogProps) {
  const {
    mode,
    groupTitle,
    name,
    onNameChange,
    people,
    onRemovePerson,
    query,
    onQueryChange,
    suggestions,
    onPick,
    unknownEmail,
    inviteToken,
    linkCopied,
    onCopyLink,
    onSubmit,
    onClose,
  } = props;
  const add = mode === "add";
  const canSubmit = add ? people.length > 0 : name.trim() !== "" || people.length > 0;
  const title = add ? `Add people to ${groupTitle ?? ""}` : "New group";
  const last = people.at(-1);

  return (
    <Dialog label={title} size="wide" onClose={onClose}>
      <h3>{title}</h3>
      <p className="sub">
        {add
          ? "They can read the whole history once they join."
          : "Everyone you add can read and write in the group."}
      </p>
      {add ? null : (
        <Field label="Group name" htmlFor="new-group-name">
          <TextInput
            id="new-group-name"
            value={name}
            onChange={onNameChange}
            placeholder="Name this group"
            focusOnOpen
          />
        </Field>
      )}
      <Field label="Add people" htmlFor="new-group-people">
        <div className="chips">
          {people.map((person) => (
            <PeopleChip
              key={person.id}
              name={person.name}
              avatar={person.avatar}
              onRemove={() => onRemovePerson(person)}
            />
          ))}
          <input
            id="new-group-people"
            data-autofocus={add ? "" : undefined}
            value={query}
            placeholder={people.length > 0 ? "Add another" : "Name or email"}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              const top = suggestions[0];
              if (event.key === "Enter") {
                event.preventDefault();
                if (top !== undefined) onPick(top);
              } else if (event.key === "Backspace" && query === "" && last !== undefined) {
                onRemovePerson(last);
              }
            }}
          />
        </div>
        {suggestions.length > 0 ? (
          <div className="sugg">
            {suggestions.map((person) => (
              <button key={person.id} type="button" onClick={() => onPick(person)}>
                <Avatar avatar={person.avatar} size="sm" />
                <span>
                  <b>{person.name}</b>
                  <small>{person.email}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {unknownEmail === null ? null : (
          <output className="hint">
            <Icon name="alert" />
            <span>
              <b>{unknownEmail}</b> doesn't have an account yet. Share the invite link, and they
              join once they sign up.
            </span>
          </output>
        )}
        {unknownEmail === null && query.trim() === "" && people.length === 0 ? (
          <div className="hint">
            <Icon name="info" />
            <span>
              People with an account can be added by name or email. For anyone else, share the
              invite link.
            </span>
          </div>
        ) : null}
      </Field>
      <Field label="Invite link">
        <LinkBox
          url={`chat.q9labs.ai/join/${inviteToken}`}
          copied={linkCopied}
          onCopy={onCopyLink}
        />
        <small className="note" style={{ margin: "0 2px" }}>
          {add
            ? "Anyone with the link can join and read the whole group."
            : "Anyone with the link can join once the group exists."}
        </small>
      </Field>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" disabled={!canSubmit} onClick={onSubmit}>
          {primaryLabel(props)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Search ----------

interface SearchDialogProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  /** The group the search is limited to, or null for all groups. */
  readonly scopeTitle: string | null;
  readonly onClearScope: () => void;
  readonly hits: readonly SearchHit[];
  readonly onOpenHit: (hit: SearchHit) => void;
  readonly onClose: () => void;
}

function Snippet({ text, query }: { readonly text: string; readonly query: string }) {
  let offset = 0;
  return splitMatches(text, query).map((part) => {
    offset += part.text.length;
    return part.match ? (
      <mark key={offset}>{part.text}</mark>
    ) : (
      <span key={offset}>{part.text}</span>
    );
  });
}

/** Search messages in all groups, or in one. Enter opens the first result, Esc closes. */
export function SearchDialog({
  query,
  onQueryChange,
  scopeTitle,
  onClearScope,
  hits,
  onOpenHit,
  onClose,
}: SearchDialogProps) {
  const { clock } = useRoot();
  const trimmed = query.trim();
  const chip =
    scopeTitle === null
      ? null
      : scopeTitle.length > 22
        ? `${scopeTitle.slice(0, 21)}…`
        : scopeTitle;

  return (
    <Dialog label="Search messages" size="top" onClose={onClose}>
      <div className="sin">
        <Icon name="search" />
        <input
          data-autofocus=""
          value={query}
          aria-label="Search messages"
          placeholder="Search messages"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            const first = hits[0];
            if (event.key === "Enter" && first !== undefined) {
              event.preventDefault();
              onOpenHit(first);
            }
          }}
        />
        {chip === null ? null : (
          <span className="schip">
            In {chip}
            <button type="button" aria-label="Search all groups" onClick={onClearScope}>
              <Icon name="x" />
            </button>
          </span>
        )}
      </div>
      <div className="res">
        {trimmed === "" ? (
          <div className="sempty">Search messages in {scopeTitle ?? "all your groups"}.</div>
        ) : hits.length === 0 ? (
          <div className="sempty">No messages match “{trimmed}”.</div>
        ) : (
          <>
            <div className="rhead">
              {hits.length} {hits.length === 1 ? "message" : "messages"}
            </div>
            {hits.map((hit) => (
              <button
                key={`${hit.groupId}-${hit.sequence}`}
                type="button"
                className="ri"
                onClick={() => onOpenHit(hit)}
              >
                <Avatar avatar={hit.groupAvatar} size="sm" />
                <span style={{ minWidth: 0 }}>
                  <span className="rm">
                    <b>{hit.groupTitle}</b>
                    <span>· {hit.author.isYou ? "You" : hit.author.name}</span>
                    <span className="t">{rowStamp(hit.createdAt, clock)}</span>
                  </span>
                  <span className="sn">
                    <Snippet text={hit.snippet} query={trimmed} />
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
      <div className="sfoot2">
        <span>
          <kbd>Enter</kbd> opens the first result
        </span>
        <span>
          <kbd>Esc</kbd> closes
        </span>
      </div>
    </Dialog>
  );
}

// ---------- Account ----------

interface AccountDialogProps {
  readonly me: Me;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly onUploadPhoto: () => void;
  readonly onRemovePhoto: () => void;
  readonly onDeleteAccount: () => void;
  readonly onSignOut: () => void;
  readonly onClose: () => void;
}

function ProviderMark({ provider }: { readonly provider: string }) {
  if (provider === "Google") return <GoogleMark />;
  if (provider === "Apple") return <AppleMark />;
  return <Icon name="mail" />;
}

/** Name, photo, how you signed in, Delete account and Sign out. */
export function AccountDialog({
  me,
  name,
  onNameChange,
  onUploadPhoto,
  onRemovePhoto,
  onDeleteAccount,
  onSignOut,
  onClose,
}: AccountDialogProps) {
  const hasPhoto = me.avatar.photoUrl !== null;
  const togglePhoto = hasPhoto ? onRemovePhoto : onUploadPhoto;
  return (
    <Dialog label="Account" onClose={onClose}>
      <div className="dhead">
        <h3>Account</h3>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </div>
      <div className="ihero" style={{ paddingTop: 4 }}>
        <button
          type="button"
          className="pfav"
          aria-label={hasPhoto ? "Remove a photo" : "Add a photo"}
          onClick={togglePhoto}
        >
          <Avatar avatar={me.avatar} size="xl" />
          <span className="cam">
            <Icon name="camera" />
          </span>
        </button>
        <h3>{me.displayName}</h3>
        <p>{me.email}</p>
      </div>
      <Field label="Name" htmlFor="account-name">
        <TextInput id="account-name" value={name} onChange={onNameChange} />
      </Field>
      <Field label="Photo">
        <div className="prow">
          <Button onClick={togglePhoto}>{hasPhoto ? "Remove photo" : "Upload photo"}</Button>
          <small className="note" style={{ margin: 0 }}>
            {hasPhoto
              ? "People see your photo."
              : "Without a photo, people see your initials on your color."}
          </small>
        </div>
      </Field>
      <Field label="Signed in with">
        <FlatField>
          <ProviderMark provider={me.provider} />
          <span>
            {me.provider} · {me.email}
          </span>
        </FlatField>
      </Field>
      <DialogActions spread>
        <Button variant="danger" icon="trash" onClick={onDeleteAccount}>
          Delete account
        </Button>
        <Button icon="logout" onClick={onSignOut}>
          Sign out
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Confirmations ----------

interface ConfirmProps {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

function Confirm({ title, body, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  return (
    <Dialog label={title} onClose={onClose}>
      <h3>{title}</h3>
      <p className="sub">{body}</p>
      <DialogActions>
        <Button data-autofocus="" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="solidDanger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface Closable {
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function DeleteMessageDialog(props: Closable) {
  return (
    <Confirm
      {...props}
      title="Delete this message?"
      body="It's removed for everyone. A quiet placeholder stays, so replies to it still make sense."
      confirmLabel="Delete"
    />
  );
}

export function RemoveMemberDialog({
  name,
  groupTitle,
  ...rest
}: Closable & { readonly name: string; readonly groupTitle: string }) {
  return (
    <Confirm
      {...rest}
      title={`Remove ${name}?`}
      body={`${name} loses access to ${groupTitle} and its history. Everyone in the group sees that you removed ${name}.`}
      confirmLabel={`Remove ${name}`}
    />
  );
}

export function LeaveGroupDialog({
  groupTitle,
  ...rest
}: Closable & { readonly groupTitle: string }) {
  return (
    <Confirm
      {...rest}
      title={`Leave ${groupTitle}?`}
      body="You lose access to the group and its history. A member can add you back."
      confirmLabel="Leave group"
    />
  );
}

export function DeleteAccountDialog(props: Closable) {
  return (
    <Confirm
      {...props}
      title="Delete your account?"
      body="You leave every group. Your messages stay so conversations still make sense, and show “Deleted account” as the sender. This can't be undone."
      confirmLabel="Delete account"
    />
  );
}

export type ReportReason = "spam" | "harassment" | "other";

interface ReportDialogProps {
  readonly authorName: string;
  readonly reason: ReportReason | null;
  readonly onReasonChange: (reason: ReportReason) => void;
  readonly onSend: () => void;
  readonly onClose: () => void;
}

/** Pick a reason, then send. The author is never told who reported. */
export function ReportDialog({
  authorName,
  reason,
  onReasonChange,
  onSend,
  onClose,
}: ReportDialogProps) {
  return (
    <Dialog label="Report this message" onClose={onClose}>
      <h3>Report this message</h3>
      <p className="sub">
        We review reports within a day. {authorName} isn't told who reported it.
      </p>
      <RadioList
        label="Reason"
        value={reason}
        onChange={onReasonChange}
        options={[
          { value: "spam", label: "Spam" },
          { value: "harassment", label: "Harassment or hate" },
          { value: "other", label: "Something else" },
        ]}
      />
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="solid" disabled={reason === null} onClick={onSend}>
          Send report
        </Button>
      </DialogActions>
    </Dialog>
  );
}
