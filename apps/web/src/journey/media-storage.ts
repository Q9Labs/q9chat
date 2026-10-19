import { Either, Schema } from "effect";

import { QuotedReply } from "./text-storage.js";

const positive = Schema.Number.pipe(Schema.finite(), Schema.positive());
const bytes = Schema.instanceOf(Blob).pipe(
  Schema.filter((blob) => blob.size > 0 && blob.size <= 20_000_000),
);
const media = Schema.Union(
  Schema.Struct({
    kind: Schema.Literal("file"),
    blob: bytes,
    name: Schema.String.pipe(Schema.maxLength(200), Schema.minLength(1)),
  }),
  Schema.Struct({
    kind: Schema.Literal("image"),
    blob: bytes,
    width: positive.pipe(Schema.int(), Schema.lessThanOrEqualTo(8000)),
    height: positive.pipe(Schema.int(), Schema.lessThanOrEqualTo(8000)),
  }),
  Schema.Struct({
    kind: Schema.Literal("voice"),
    blob: bytes,
    durationMs: positive.pipe(Schema.lessThanOrEqualTo(600_000)),
    waveform: Schema.Array(Schema.Number.pipe(Schema.finite(), Schema.between(0, 1))).pipe(
      Schema.maxItems(64),
    ),
  }),
);
export type Media = typeof media.Type;
const saved = Schema.Struct({
  clientKey: Schema.String,
  reply: Schema.optional(QuotedReply),
  createdAt: Schema.Number,
  files: Schema.Array(media).pipe(Schema.minItems(1), Schema.maxItems(10)),
});
export type SavedMedia = typeof saved.Type;
const decodeSavedMedia = Schema.decodeUnknownEither(saved);

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("q9chat-media-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("pending");
    request.onsuccess = () => resolve(request.result);
    request.addEventListener("error", () => reject(request.error), { once: true });
    request.onblocked = () =>
      reject(new Error("Unsent media storage is blocked. Close other Q9 Chat tabs and retry."));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operate: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("pending", mode);
      const request = operate(tx.objectStore("pending"));
      tx.oncomplete = () => resolve(request.result);
      tx.addEventListener(
        "abort",
        () => reject(tx.error ?? new Error("Couldn't save unsent media.")),
        { once: true },
      );
      tx.addEventListener("error", () => reject(tx.error), { once: true });
    });
  } finally {
    db.close();
  }
}
const entryKey = (scope: string, clientKey: string) => `${scope}:${clientKey}`;
export async function loadMedia(scope: string): Promise<{
  readonly posts: readonly SavedMedia[];
  readonly damaged: boolean;
}> {
  const range = IDBKeyRange.bound(`${scope}:`, `${scope}:\uffff`);
  let keys: readonly IDBValidKey[] = [];
  const values: readonly unknown[] = await transaction("readonly", (store) => {
    const request = store.getAllKeys(range);
    request.onsuccess = () => {
      keys = request.result;
    };
    return store.getAll(range);
  });
  const posts: SavedMedia[] = [];
  let damaged = false;
  for (const [index, value] of values.entries()) {
    const decoded = decodeSavedMedia(value);
    if (Either.isRight(decoded)) {
      posts.push(decoded.right);
      continue;
    }
    damaged = true;
    const key = keys[index];
    if (typeof key !== "string") continue;
    // Preserve damaged bytes outside the active prefix. Quarantine failure never hides healthy retries.
    try {
      await transaction("readwrite", (store) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const current: unknown = request.result;
          if (current === undefined || Either.isRight(decodeSavedMedia(current))) return;
          store.put(current, `quarantine:${key}`);
          store.delete(key);
        };
        return request;
      });
    } catch {
      // The raw record remains recoverable; it is independently rejected on the next load.
      damaged = true;
    }
  }
  return { posts, damaged };
}
export async function saveMedia(scope: string, post: SavedMedia) {
  await transaction("readwrite", (store) => store.put(post, entryKey(scope, post.clientKey)));
}
export async function removeMedia(scope: string, key: string) {
  await transaction("readwrite", (store) => store.delete(entryKey(scope, key)));
}

export async function clearProfileMedia(profileId: string) {
  const prefixes = [`${profileId}:`, `quarantine:${profileId}:`];
  await transaction("readwrite", (store) => {
    const request = store.getAllKeys();
    request.onsuccess = () => {
      for (const key of request.result)
        if (typeof key === "string" && prefixes.some((prefix) => key.startsWith(prefix)))
          store.delete(key);
    };
    return request;
  });
}
