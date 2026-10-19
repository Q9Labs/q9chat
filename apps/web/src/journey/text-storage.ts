import { Either, Schema } from "effect";

const PendingText = Schema.Struct({
  clientKey: Schema.String,
  body: Schema.String,
  createdAt: Schema.Number,
  status: Schema.Literal("sending", "failed"),
});
export type Pending = typeof PendingText.Type;

function restorePending(key: string, name: string): Pending | null {
  const raw = localStorage.getItem(name);
  const decoded = Schema.decodeUnknownEither(Schema.parseJson(PendingText))(raw);
  const prefix = `${key}:pending:`;
  if (Either.isRight(decoded) && name === `${prefix}${decoded.right.clientKey}`)
    return { ...decoded.right, status: "failed" };
  // Preserve the damaged value for recovery, but never let it poison another reload.
  localStorage.removeItem(name);
  try {
    localStorage.setItem(`${key}:quarantine:${name.slice(prefix.length)}`, raw ?? "");
  } catch {
    return null;
  }
  return null;
}

export function loadText(key: string): {
  readonly text: { readonly draft: string; readonly pending: readonly Pending[] };
  readonly error: string;
} {
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
