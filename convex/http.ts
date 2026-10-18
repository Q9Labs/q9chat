import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { MAX_BYTES, validContentType } from "./lib/uploads";
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
    const contentType =
      request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ??
      "application/octet-stream";
    if (!validContentType(contentType))
      return new Response(JSON.stringify({ code: "bad_attachment" }), { status: 415, headers });
    const declared = Number(request.headers.get("Content-Length"));
    if (declared > MAX_BYTES) return new Response(null, { status: 413, headers });
    if (!request.body) return new Response(null, { status: 400, headers });
    const reader: ReadableStreamDefaultReader<Uint8Array> = request.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return new Response(null, { status: 413, headers });
      }
      chunks.push(new Uint8Array(value));
    }
    if (size === 0) return new Response(null, { status: 400, headers });
    const storageId = await ctx.storage.store(new Blob(chunks, { type: contentType }));
    try {
      const uploadId = await ctx.runMutation(internal.files.recordUpload, {
        ownerId,
        storageId,
        contentType,
        size,
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
const files = httpAction(async (ctx, request) => {
  const headers = cors(request);
  if (!request.headers.get("Authorization")?.startsWith("Bearer "))
    return new Response(null, { status: 401, headers });
  const path = new URL(request.url).pathname.split("/");
  try {
    const messageId = path[2],
      index = Number(path[3]);
    if (!messageId || path.length !== 4) return new Response(null, { status: 404, headers });
    const file = await ctx.runQuery(internal.files.messageFile, { messageId, index });
    if (!file) return new Response(null, { status: 404, headers });
    const blob = await ctx.storage.get(file.storageId);
    if (!blob) return new Response(null, { status: 404, headers });
    headers.set("Content-Type", file.contentType);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(blob.stream(), { headers });
  } catch (error) {
    return errorResponse(error, headers);
  }
});
const photos = httpAction(async (ctx, request) => {
  const headers = cors(request);
  if (!request.headers.get("Authorization")?.startsWith("Bearer "))
    return new Response(null, { status: 401, headers });
  const path = new URL(request.url).pathname.split("/");
  try {
    const profileId = path[2];
    if (!profileId || path.length !== 3) return new Response(null, { status: 404, headers });
    const storageId = await ctx.runQuery(internal.files.photo, { profileId });
    const blob = storageId ? await ctx.storage.get(storageId) : null;
    if (!blob) return new Response(null, { status: 404, headers });
    headers.set("Content-Type", blob.type);
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(blob.stream(), { headers });
  } catch (error) {
    return errorResponse(error, headers);
  }
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
