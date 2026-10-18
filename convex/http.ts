import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { sniff } from "./lib/sniff";
import { MAX_BYTES } from "./lib/uploads";
const origins = new Set(["http://localhost:3000", "https://chat.q9labs.ai"]);
function cors(request: Request) {
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "private" });
  const origin = request.headers.get("Origin");
  if (origin && origins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  return headers;
}
function errorResponse(error: unknown, headers: Headers) {
  if (error instanceof ConvexError)
    return new Response(JSON.stringify(error.data), { status: 403, headers });
  throw error;
}
const upload = httpAction(async (ctx, request) => {
  const headers = cors(request);
  headers.set("Content-Type", "application/json");
  if (!request.headers.get("Authorization")?.startsWith("Bearer "))
    return new Response(null, { status: 401, headers });
  try {
    const ownerId = await ctx.runQuery(internal.files.authorizeUpload, {});
    const declared = Number(request.headers.get("Content-Length"));
    if (declared > MAX_BYTES) return new Response(null, { status: 413, headers });
    if (!request.body) return new Response(null, { status: 400, headers });
    const reader: ReadableStreamDefaultReader<Uint8Array> = request.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    let chunk = await reader.read();
    while (!chunk.done) {
      const value = chunk.value;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return new Response(null, { status: 413, headers });
      }
      chunks.push(new Uint8Array(value));
      chunk = await reader.read();
    }
    if (size === 0) return new Response(null, { status: 400, headers });
    const prefix = new Uint8Array(Math.min(size, 72));
    let offset = 0;
    for (const part of chunks) {
      const count = Math.min(part.length, prefix.length - offset);
      prefix.set(part.subarray(0, count), offset);
      offset += count;
      if (offset === prefix.length) break;
    }
    const { kind, contentType } = sniff(prefix);
    const storageId = await ctx.storage.store(new Blob(chunks, { type: contentType }));
    try {
      const uploadId = await ctx.runMutation(internal.files.recordUpload, {
        ownerId,
        storageId,
        contentType,
        size,
        kind,
      });
      return new Response(JSON.stringify({ uploadId }), { status: 200, headers });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
  } catch (error) {
    return errorResponse(error, headers);
  }
});
function stream(blob: Blob | null, headers: Headers, contentType = blob?.type) {
  if (!blob) return new Response(null, { status: 404, headers });
  headers.set("Content-Type", contentType ?? "application/octet-stream");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(blob.stream(), { headers });
}
function authenticatedGet(
  resolve: (ctx: ActionCtx, path: string[], headers: Headers) => Promise<Response>,
) {
  return httpAction(async (ctx, request) => {
    const headers = cors(request);
    if (!request.headers.get("Authorization")?.startsWith("Bearer "))
      return new Response(null, { status: 401, headers });
    try {
      return await resolve(ctx, new URL(request.url).pathname.split("/"), headers);
    } catch (error) {
      return errorResponse(error, headers);
    }
  });
}
const files = authenticatedGet(async (ctx, path, headers) => {
  const messageId = path[2],
    index = Number(path[3]);
  if (!messageId || path.length !== 4) return new Response(null, { status: 404, headers });
  const file = await ctx.runQuery(internal.files.messageFile, { messageId, index });
  if (!file) return new Response(null, { status: 404, headers });
  return stream(await ctx.storage.get(file.storageId), headers, file.contentType);
});
const photos = authenticatedGet(async (ctx, path, headers) => {
  const profileId = path[2];
  if (!profileId || path.length !== 3) return new Response(null, { status: 404, headers });
  const storageId = await ctx.runQuery(internal.files.photo, { profileId });
  return stream(storageId ? await ctx.storage.get(storageId) : null, headers);
});
const preflight = httpAction(
  async (_ctx, request) => new Response(null, { status: 204, headers: cors(request) }),
);
const http = httpRouter();
http.route({ path: "/upload", method: "POST", handler: upload });
http.route({ path: "/upload", method: "OPTIONS", handler: preflight });
for (const pathPrefix of ["/files/", "/photos/"]) {
  http.route({ pathPrefix, method: "GET", handler: pathPrefix === "/files/" ? files : photos });
  http.route({ pathPrefix, method: "OPTIONS", handler: preflight });
}
export default http;
