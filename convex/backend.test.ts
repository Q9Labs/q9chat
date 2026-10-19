import { createECDH, randomBytes } from "node:crypto";

import {
  avatarColors,
  duration,
  eventSentence,
  fileSize,
  initials,
  listPreview,
  parseMentions,
  timeLabel,
} from "@q9chat/domain";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import crons from "./crons";
import { sniff } from "./lib/sniff";
import schema from "./schema";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./vitest.config.ts"]);
const outbound = vi.fn<typeof fetch>();
const fetchUrl = (input: Parameters<typeof fetch>[0]) =>
  input instanceof Request ? input.url : input.toString();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("WORKOS_API_KEY", "test-workos-key");
  vi.stubGlobal("fetch", outbound);
  outbound.mockReset().mockImplementation(async (input, init) => {
    const url = fetchUrl(input);
    if (url.startsWith("https://api.workos.com/user_management/users/")) {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      const id = url.split("/").at(-1) ?? "";
      return Response.json({
        id,
        email: `${id}@example.com`,
        email_verified: true,
        first_name: id,
        last_name: "Person",
      });
    }
    if (url === "https://exp.host/--/api/v2/push/send")
      return Response.json({ data: { status: "ok" } });
    if (url.startsWith("https://fcm.googleapis.com/")) return new Response(null, { status: 201 });
    throw new Error(`Unexpected outbound fetch: ${url}`);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function fixture() {
  return convexTest({ schema, modules, transactionLimits: true });
}
function pushKeys() {
  return {
    p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  };
}
type Test = ReturnType<ReturnType<typeof fixture>["withIdentity"]>;
async function account(t: Test, subject: string, displayName = `${subject} Person`) {
  const client = t.withIdentity({
    subject,
    name: "Untrusted name",
    email: "untrusted@example.com",
  });
  const id = await client.action(api.profiles.setUp, { displayName });
  return { client, id };
}
async function group(t: Test) {
  const alice = await account(t, "Alice"),
    bob = await account(t, "Bob"),
    carol = await account(t, "Carol");
  const groupId = await alice.client.mutation(api.groups.create, {
    name: "Team",
    memberIds: [bob.id],
    inviteToken: "TeamInvite12345678",
  });
  return { alice, bob, carol, groupId };
}
const send = (client: Test, groupId: Id<"groups">, body = "hello", clientKey = "key") =>
  client.mutation(api.messages.send, { groupId, body, clientKey, attachments: [] });
async function upload(client: Test, body = "file bytes", type = "text/plain") {
  const response = await client.fetch("/upload", {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      "Content-Type": type,
      Origin: "http://localhost:3000",
    },
    body:
      type === "image/png"
        ? new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...new TextEncoder().encode(body)])
        : type === "audio/mp4"
          ? new Uint8Array([0, 0, 0, 12, ...new TextEncoder().encode("ftypM4A mp4a" + body)])
          : body,
  });
  expect(response.status).toBe(200);
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("uploadId" in data) ||
    typeof data.uploadId !== "string"
  )
    throw new Error("Invalid upload response");
  const id = await client.run(async (ctx) => ctx.db.normalizeId("uploads", String(data.uploadId)));
  if (!id) throw new Error("Invalid upload id");
  return id;
}
async function drain(t: Test, expectedFailures = 0) {
  const failures = async () =>
    (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter(
      (job) => job.state.kind === "failed",
    ).length;
  const before = await failures();
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await failures()).toBe(before + expectedFailures);
}
async function row(client: Test, groupId: Id<"groups">) {
  const rows = await client.query(api.groups.list, {});
  return rows.find((value) => value.groupId === groupId);
}
describe("identity and access classes", () => {
  it("uses sign-in account colors until the profile becomes a tombstone, without changing groups", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    expect(await bob.client.query(api.profiles.me, {})).toMatchObject({
      status: "ready",
      profile: avatarColors("Bob"),
    });
    for (const status of ["active", "deleting", "deleted"] as const) {
      if (status !== "active")
        await t.run((ctx) =>
          ctx.db.replace(
            bob.id,
            status === "deleting"
              ? { status, authUserId: "Bob", requestedAt: Date.now() }
              : { status, deletedAt: Date.now() },
          ),
        );
      const info = await alice.client.query(api.groups.get, { groupId });
      if (info?.status !== "member") throw new Error("Expected group membership");
      expect(info.avatar).toMatchObject(avatarColors(groupId));
      expect(info.members.find((person) => person.id === bob.id)?.avatar).toMatchObject(
        avatarColors(status === "deleted" ? bob.id : "Bob"),
      );
    }
  });
  it("sniffs HEIC as a file before MP4 voice and rejects it as a profile photo", async () => {
    const bytes = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic0000mif1")]);
    expect(sniff(bytes)).toEqual({ kind: "file", contentType: "image/heic" });
    const t = fixture();
    const alice = await account(t, "Alice");
    const response = await alice.client.fetch("/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "image/heic",
        Origin: "http://localhost:3000",
      },
      body: bytes,
    });
    expect(response.status).toBe(200);
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      !("uploadId" in data) ||
      typeof data.uploadId !== "string"
    )
      throw new Error("Missing HEIC upload");
    const uploadId = await t.run(async (ctx) =>
      ctx.db.normalizeId("uploads", String(data.uploadId)),
    );
    if (!uploadId) throw new Error("Invalid HEIC upload id");
    await expect(
      alice.client.mutation(api.profiles.update, { photoUploadId: uploadId }),
    ).rejects.toThrow("bad_attachment");
  });
  it("permits anyone only me, rejects signed-out and profileless active calls", async () => {
    const t = fixture();
    expect(await t.query(api.profiles.me, {})).toBeNull();
    await expect(t.query(api.groups.list, {})).rejects.toThrow("account_unavailable");
    await expect(t.action(api.profiles.setUp, { displayName: "A" })).rejects.toThrow(
      "account_unavailable",
    );
    const client = t.withIdentity({ subject: "new", email: "new@example.com", name: "New" });
    expect(await client.query(api.profiles.me, {})).toEqual({
      status: "needsSetup",
    });
    await expect(client.query(api.groups.list, {})).rejects.toThrow("account_unavailable");
  });
  it("setup uses WorkOS email, is idempotent, rejects blanks and missing WorkOS users", async () => {
    const t = fixture();
    const alice = await account(t, "Alice", " Alice Smith ");
    expect(await alice.client.action(api.profiles.setUp, { displayName: "Changed" })).toBe(
      alice.id,
    );
    expect(await alice.client.query(api.profiles.me, {})).toMatchObject({
      status: "ready",
      profile: { displayName: "Alice Smith", email: "alice@example.com" },
    });
    await expect(alice.client.action(api.profiles.setUp, { displayName: " " })).rejects.toThrow(
      "name_required",
    );
    outbound.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(
      t.withIdentity({ subject: "missing" }).action(api.profiles.setUp, { displayName: "Missing" }),
    ).rejects.toThrow("account_unavailable");
  });
  it("denies non-members and removed people history and writes, but shows only the removal notice", async () => {
    const t = fixture();
    const { alice, bob, carol, groupId } = await group(t);
    await expect(send(carol.client, groupId)).rejects.toThrow("not_member");
    expect(await carol.client.query(api.groups.get, { groupId })).toBeNull();
    await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
    expect(await bob.client.query(api.groups.get, { groupId })).toMatchObject({
      status: "removed",
      memberCount: 1,
      removedBy: { id: alice.id },
    });
    await expect(
      bob.client.query(api.messages.range, { groupId, fromSequence: 1, toSequence: 10 }),
    ).rejects.toThrow("not_member");
    await expect(bob.client.mutation(api.typing.start, { groupId })).rejects.toThrow("not_member");
    await drain(t);
  });
  it("locks deleting and deleted accounts, including setup and leftover memberships", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await bob.client.mutation(api.profiles.deleteAccount, {});
    expect(await bob.client.query(api.profiles.me, {})).toEqual({ status: "unavailable" });
    await expect(bob.client.query(api.groups.list, {})).rejects.toThrow("account_unavailable");
    await expect(send(bob.client, groupId)).rejects.toThrow("account_unavailable");
    await expect(bob.client.action(api.profiles.setUp, { displayName: "Bob" })).rejects.toThrow(
      "account_unavailable",
    );
    await drain(t);
    const tombstone = await t.run((ctx) => ctx.db.get(bob.id));
    expect(tombstone).toMatchObject({ status: "deleted" });
    expect(tombstone).not.toHaveProperty("authUserId");
    await expect(bob.client.query(api.groups.list, {})).rejects.toThrow("account_unavailable");
    outbound.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(bob.client.action(api.profiles.setUp, { displayName: "Bob" })).rejects.toThrow(
      "account_unavailable",
    );
    expect(await alice.client.query(api.groups.get, { groupId })).toMatchObject({
      status: "member",
      memberCount: 1,
    });
  });
});
describe("groups and people", () => {
  it("creates gap-free events and initially read membership; defaults title from first names", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const info = await alice.client.query(api.groups.get, { groupId });
    expect(info).toMatchObject({
      status: "member",
      lastSequence: 2,
      lastReadSequence: 2,
      memberCount: 2,
    });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 0, needsYou: false });
    const messages = await alice.client.query(api.messages.range, {
      groupId,
      fromSequence: 1,
      toSequence: 2,
    });
    expect(messages.map((message) => message.sequence)).toEqual([1, 2]);
    const id = await alice.client.mutation(api.groups.create, {
      memberIds: [bob.id],
      inviteToken: "AnotherToken12345",
    });
    expect(await alice.client.query(api.groups.get, { groupId: id })).toMatchObject({
      title: "Bob",
    });
    await expect(
      alice.client.mutation(api.groups.create, {
        memberIds: [],
        inviteToken: "BlankToken12345678",
      }),
    ).rejects.toThrow("name_required");
    await expect(
      alice.client.mutation(api.groups.create, {
        name: "Dup",
        memberIds: [],
        inviteToken: "TeamInvite12345678",
      }),
    ).rejects.toThrow("Invalid or reused invite token");
  });
  it("pair creation is idempotent, locks membership changes and retains deleted partner identity", async () => {
    const t = fixture();
    const { alice, bob, carol } = await group(t);
    expect(await alice.client.query(api.groups.pairWith, { profileId: bob.id })).toBeNull();
    const id = await alice.client.mutation(api.groups.openPair, { profileId: bob.id });
    expect(await bob.client.mutation(api.groups.openPair, { profileId: alice.id })).toBe(id);
    expect(await alice.client.query(api.groups.pairWith, { profileId: bob.id })).toBe(id);
    await expect(
      alice.client.mutation(api.groups.addMembers, { groupId: id, profileIds: [carol.id] }),
    ).rejects.toThrow("pair_locked");
    await expect(
      alice.client.mutation(api.groups.removeMember, { groupId: id, profileId: bob.id }),
    ).rejects.toThrow("pair_locked");
    await expect(alice.client.mutation(api.groups.leave, { groupId: id })).rejects.toThrow(
      "pair_locked",
    );
    await bob.client.mutation(api.profiles.deleteAccount, {});
    await drain(t);
    expect(await alice.client.query(api.groups.get, { groupId: id })).toMatchObject({
      title: "Deleted account",
      partner: { id: bob.id, deleted: true },
    });
  });
  it("removal blocks invite join after dismissal; re-add clears the ban and retry adds nobody twice", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
    expect(await bob.client.query(api.groups.inviteInfo, { token: "TeamInvite12345678" })).toEqual({
      status: "removed",
    });
    await bob.client.mutation(api.groups.dismissRemoval, { groupId });
    expect(await bob.client.query(api.groups.list, {})).toEqual([]);
    await expect(
      bob.client.mutation(api.groups.join, { token: "TeamInvite12345678" }),
    ).rejects.toThrow("removed_from_group");
    await alice.client.mutation(api.groups.addMembers, { groupId, profileIds: [bob.id, bob.id] });
    await alice.client.mutation(api.groups.addMembers, { groupId, profileIds: [bob.id] });
    expect(await alice.client.query(api.groups.get, { groupId })).toMatchObject({
      lastSequence: 4,
      memberCount: 2,
    });
    expect(await bob.client.mutation(api.groups.join, { token: "TeamInvite12345678" })).toBe(
      groupId,
    );
  });
  it("leave is a no-op for outsiders and repeated calls, while valid invite joining adds one event", async () => {
    const t = fixture();
    const { alice, bob, carol, groupId } = await group(t);
    await carol.client.mutation(api.groups.leave, { groupId });
    expect(
      await carol.client.query(api.groups.inviteInfo, { token: "TeamInvite12345678" }),
    ).toMatchObject({ status: "open", title: "Team", memberCount: 2 });
    await carol.client.mutation(api.groups.join, { token: "TeamInvite12345678" });
    await carol.client.mutation(api.groups.join, { token: "TeamInvite12345678" });
    await bob.client.mutation(api.groups.leave, { groupId });
    await bob.client.mutation(api.groups.leave, { groupId });
    expect(await alice.client.query(api.groups.get, { groupId })).toMatchObject({
      lastSequence: 4,
      memberCount: 2,
    });
  });
  it("directory prefixes only expose shared members; exact email finds an outsider", async () => {
    const t = fixture();
    const { alice, bob, carol } = await group(t);
    expect(await alice.client.query(api.people.find, { query: "bo" })).toMatchObject([
      { id: bob.id, email: null },
    ]);
    expect(await alice.client.query(api.people.find, { query: "BOB@example.com" })).toMatchObject([
      { id: bob.id, email: "bob@example.com" },
    ]);
    expect(await alice.client.query(api.people.find, { query: "car" })).toEqual([]);
    expect(await alice.client.query(api.people.find, { query: "CAROL@example.com" })).toMatchObject(
      [{ id: carol.id }],
    );
  });
});
describe("posts, unread and mutations", () => {
  it("deduplicates retries before content validation even after editing and deletion; rejects a different group", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const original = await send(alice.client, groupId);
    await alice.client.mutation(api.messages.edit, {
      messageId: original.messageId,
      body: "edited",
    });
    expect(await send(alice.client, groupId, "", "key")).toEqual(original);
    await alice.client.mutation(api.messages.remove, { messageId: original.messageId });
    expect(await send(alice.client, groupId, "x".repeat(4001))).toEqual(original);
    const pair = await alice.client.mutation(api.groups.openPair, { profileId: bob.id });
    await expect(send(alice.client, pair)).rejects.toThrow("client_key_reused");
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 1 });
    await drain(t);
  });
  it("counts only other posts, caps unread at 100, preserves deleted unread and clears only through the read position", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    let first: Awaited<ReturnType<typeof send>> | null = null;
    for (let index = 0; index < 102; index++) {
      const message = await send(alice.client, groupId, "post", String(index));
      first ??= message;
    }
    if (!first) throw new Error("Missing first post");
    expect(await row(alice.client, groupId)).toMatchObject({ unreadCount: 0 });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 100 });
    expect(await alice.client.query(api.groups.get, { groupId })).toMatchObject({
      firstUnreadSequence: null,
    });
    expect(await bob.client.query(api.groups.get, { groupId })).toMatchObject({
      firstUnreadSequence: first.sequence,
    });
    await alice.client.mutation(api.messages.remove, { messageId: first.messageId });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 100 });
    await bob.client.mutation(api.readStates.markRead, { groupId, sequence: 103 });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 1 });
    expect(await bob.client.query(api.groups.get, { groupId })).toMatchObject({
      firstUnreadSequence: 104,
    });
    await bob.client.mutation(api.readStates.markRead, { groupId, sequence: 3 });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 1 });
    await expect(
      bob.client.mutation(api.readStates.markRead, { groupId, sequence: 105 }),
    ).rejects.toThrow("bad_attachment");
    await drain(t);
  });
  it("needs-you records mentions and replies at send time, not edits, and only markRead clears it", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const message = await send(alice.client, groupId, "@bOb please");
    expect(await row(bob.client, groupId)).toMatchObject({ needsYou: true });
    await alice.client.mutation(api.messages.edit, {
      messageId: message.messageId,
      body: "without mention",
    });
    await alice.client.mutation(api.messages.remove, { messageId: message.messageId });
    expect(await row(bob.client, groupId)).toMatchObject({ needsYou: true });
    await bob.client.mutation(api.readStates.markRead, { groupId, sequence: message.sequence });
    expect(await row(bob.client, groupId)).toMatchObject({ needsYou: false });
    const post = await send(bob.client, groupId, "reply to me", "bob");
    await alice.client.mutation(api.messages.send, {
      groupId,
      clientKey: "reply",
      body: "yes",
      replyToId: post.messageId,
      attachments: [],
    });
    expect(await row(bob.client, groupId)).toMatchObject({ needsYou: true });
    await drain(t);
  });
  it("validates text, edit authorship, event replies and range bounds", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await expect(send(alice.client, groupId, " ")).rejects.toThrow("bad_attachment");
    await expect(send(alice.client, groupId, "x".repeat(4001))).rejects.toThrow("message_too_long");
    const message = await send(alice.client, groupId);
    await expect(
      bob.client.mutation(api.messages.edit, { messageId: message.messageId, body: "hack" }),
    ).rejects.toThrow("not_author");
    await expect(
      alice.client.mutation(api.messages.edit, { messageId: message.messageId, body: " " }),
    ).rejects.toThrow("bad_attachment");
    const events = await alice.client.query(api.messages.range, {
      groupId,
      fromSequence: 1,
      toSequence: 3,
    });
    const event = events[0];
    if (!event) throw new Error("Missing event");
    await expect(
      alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: "event",
        body: "reply",
        replyToId: event.id,
        attachments: [],
      }),
    ).rejects.toThrow("bad_attachment");
    await expect(
      alice.client.query(api.messages.range, { groupId, fromSequence: 1, toSequence: 101 }),
    ).rejects.toThrow("bad_attachment");
    await drain(t);
  });
  it("replaces one reaction per person, clears it, and deletes reactions with a post", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const message = await send(alice.client, groupId);
    await bob.client.mutation(api.messages.react, { messageId: message.messageId, emoji: "👍" });
    await bob.client.mutation(api.messages.react, { messageId: message.messageId, emoji: "❤️" });
    expect(
      await bob.client.query(api.messages.range, { groupId, fromSequence: 3, toSequence: 3 }),
    ).toMatchObject([{ reactions: [{ emoji: "❤️", count: 1, mine: true }] }]);
    await bob.client.mutation(api.messages.react, { messageId: message.messageId, emoji: null });
    expect(
      await bob.client.query(api.messages.range, { groupId, fromSequence: 3, toSequence: 3 }),
    ).toMatchObject([{ reactions: [] }]);
    await bob.client.mutation(api.messages.react, { messageId: message.messageId, emoji: "😂" });
    await alice.client.mutation(api.messages.remove, { messageId: message.messageId });
    await expect(
      bob.client.mutation(api.messages.react, { messageId: message.messageId, emoji: "👍" }),
    ).rejects.toThrow("bad_attachment");
    await drain(t);
  });
  it("search never reveals other groups or deleted posts; typing excludes self, expiry and removal", async () => {
    const t = fixture();
    const { alice, bob, carol, groupId } = await group(t);
    const message = await send(alice.client, groupId, "TestFlight launch");
    expect(await bob.client.action(api.messages.search, { query: "Test" })).toHaveLength(1);
    expect(await carol.client.action(api.messages.search, { query: "Test", groupId })).toEqual([]);
    await alice.client.mutation(api.typing.start, { groupId });
    await bob.client.mutation(api.typing.start, { groupId });
    expect(await alice.client.query(api.typing.list, { groupId })).toMatchObject([
      { id: bob.id, name: "Bob" },
    ]);
    await bob.client.mutation(api.typing.stop, { groupId });
    expect(await alice.client.query(api.typing.list, { groupId })).toEqual([]);
    await bob.client.mutation(api.typing.start, { groupId });
    vi.setSystemTime(Date.now() + 6000);
    expect(await alice.client.query(api.typing.list, { groupId })).toEqual([]);
    await alice.client.mutation(api.messages.remove, { messageId: message.messageId });
    expect(await bob.client.action(api.messages.search, { query: "Test" })).toEqual([]);
    await drain(t);
  });
  it("report is private, unique and keeps its excerpt after deletion", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const post = await send(alice.client, groupId, "evidence");
    await expect(
      alice.client.mutation(api.reports.create, { messageId: post.messageId, reason: "spam" }),
    ).rejects.toThrow("not_author");
    await bob.client.mutation(api.reports.create, { messageId: post.messageId, reason: "spam" });
    await bob.client.mutation(api.reports.create, { messageId: post.messageId, reason: "other" });
    await alice.client.mutation(api.messages.remove, { messageId: post.messageId });
    expect(await t.run((ctx) => ctx.db.query("reports").collect())).toMatchObject([
      { excerpt: "evidence", reporterId: bob.id, reason: "spam" },
    ]);
    await drain(t);
  });
});
describe("authenticated bytes", () => {
  it("checks ownership and single use; serves bytes only to current members with private CORS headers", async () => {
    const t = fixture();
    const { alice, bob, carol, groupId } = await group(t);
    const uploadId = await upload(alice.client);
    const args = {
      groupId,
      clientKey: "file",
      body: "",
      attachments: [{ kind: "file" as const, uploadId, name: "notes.txt" }],
    };
    await expect(bob.client.mutation(api.messages.send, args)).rejects.toThrow("bad_attachment");
    const post = await alice.client.mutation(api.messages.send, args);
    await expect(
      alice.client.mutation(api.messages.send, { ...args, clientKey: "reuse" }),
    ).rejects.toThrow("bad_attachment");
    const route = `/files/${post.messageId}/0`;
    const bytes = await bob.client.fetch(route, {
      headers: { Authorization: "Bearer test", Origin: "https://chat.q9labs.ai" },
    });
    expect(bytes.status).toBe(200);
    expect(await bytes.text()).toBe("file bytes");
    expect(bytes.headers.get("Cache-Control")).toBe("private");
    expect(bytes.headers.get("Access-Control-Allow-Origin")).toBe("https://chat.q9labs.ai");
    expect(
      (await carol.client.fetch(route, { headers: { Authorization: "Bearer test" } })).status,
    ).toBe(403);
    await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
    expect(
      (await bob.client.fetch(route, { headers: { Authorization: "Bearer test" } })).status,
    ).toBe(403);
    const page = await alice.client.query(api.messages.range, {
      groupId,
      fromSequence: post.sequence,
      toSequence: post.sequence,
    });
    expect(JSON.stringify(page)).not.toContain("storageId");
    await expect(
      alice.client.mutation(api.messages.edit, { messageId: post.messageId, body: "edit file" }),
    ).rejects.toThrow("bad_attachment");
    await alice.client.mutation(api.messages.remove, { messageId: post.messageId });
    expect(
      (await alice.client.fetch(route, { headers: { Authorization: "Bearer test" } })).status,
    ).toBe(404);
    await drain(t);
  });
  it.each(["image/png", "audio/mp4"])(
    "File accepts a sniffed %s upload without weakening strict consumers",
    async (type) => {
      const t = fixture();
      const { alice, bob, groupId } = await group(t);
      const uploadId = await upload(alice.client, "chosen bytes", type);
      await expect(
        bob.client.mutation(api.messages.send, {
          groupId,
          clientKey: "foreign",
          body: "",
          attachments: [{ kind: "file", uploadId, name: "chosen.bin" }],
        }),
      ).rejects.toThrow("bad_attachment");
      const receipt = await alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: "generic",
        body: "",
        attachments: [{ kind: "file", uploadId, name: "chosen.bin" }],
      });
      const rows = await bob.client.query(api.messages.range, {
        groupId,
        fromSequence: receipt.sequence,
        toSequence: receipt.sequence,
      });
      const post = rows[0];
      if (!post || post.kind !== "post") throw new Error("Missing post");
      expect(post.attachments[0]).toMatchObject({
        kind: "file",
        name: "chosen.bin",
        contentType: type,
      });
      await expect(
        alice.client.mutation(api.messages.send, {
          groupId,
          clientKey: "reuse-generic",
          body: "",
          attachments: [{ kind: "file", uploadId, name: "chosen.bin" }],
        }),
      ).rejects.toThrow("bad_attachment");
      await drain(t);
    },
  );
  it("rejects unauthenticated and oversized uploads; ignores declared MIME; photo consumption is single-use", async () => {
    const t = fixture();
    const alice = await account(t, "Alice");
    expect((await t.fetch("/upload", { method: "POST", body: "bytes" })).status).toBe(401);
    expect(
      (
        await alice.client.fetch("/upload", {
          method: "POST",
          headers: { Authorization: "Bearer test", "Content-Type": "image/svg+xml" },
          body: "svg",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await alice.client.fetch("/upload", {
          method: "POST",
          headers: { Authorization: "Bearer test", "Content-Length": String(21 * 1024 ** 2) },
          body: "x",
        })
      ).status,
    ).toBe(413);
    const id = await upload(alice.client, "photo", "image/png");
    await alice.client.mutation(api.profiles.update, { photoUploadId: id });
    expect(
      await (
        await alice.client.fetch(`/photos/${alice.id}`, {
          headers: { Authorization: "Bearer test" },
        })
      ).text(),
    ).toContain("photo");
    await expect(alice.client.mutation(api.profiles.update, { photoUploadId: id })).rejects.toThrow(
      "bad_attachment",
    );
    await alice.client.mutation(api.profiles.update, { photoUploadId: null });
    expect(
      (
        await alice.client.fetch(`/photos/${alice.id}`, {
          headers: { Authorization: "Bearer test" },
        })
      ).status,
    ).toBe(404);
  });
  it("validates voice duration/waveform and consumes nothing on rejected send", async () => {
    const t = fixture();
    const { alice, groupId } = await group(t);
    const uploadId = await upload(alice.client, "audio", "audio/mp4");
    const args = {
      groupId,
      clientKey: "voice",
      body: "",
      attachments: [{ kind: "voice" as const, uploadId, durationMs: 600001, waveform: [0.5] }],
    };
    await expect(alice.client.mutation(api.messages.send, args)).rejects.toThrow("bad_attachment");
    await alice.client.mutation(api.messages.send, {
      ...args,
      attachments: [{ kind: "voice", uploadId, durationMs: 3000, waveform: [0, 0.5, 1] }],
    });
    await drain(t);
  });
});
describe("delivery", () => {
  it("rechecks mute, removal and deleting status after scheduling, and never notifies authors", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await alice.client.mutation(api.devices.registerExpo, {
      expoPushToken: "ExpoPushToken[alice]",
    });
    await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
    await send(alice.client, groupId, "@Bob hello");
    await bob.client.mutation(api.groups.setNotify, { groupId, notify: "muted" });
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(
      0,
    );
    await bob.client.mutation(api.groups.setNotify, { groupId, notify: "all" });
    await send(alice.client, groupId, "all", "all");
    await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(
      0,
    );
    await alice.client.mutation(api.groups.addMembers, { groupId, profileIds: [bob.id] });
    await send(alice.client, groupId, "@Bob", "deleted");
    await bob.client.mutation(api.profiles.deleteAccount, {});
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(
      0,
    );
  });
  it("delivers mention and reply with summary and deep link; skips unrelated default posts", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
    await send(alice.client, groupId, "ordinary");
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(
      0,
    );
    const message = await send(alice.client, groupId, "@Bob hello", "mention");
    await drain(t);
    const push = outbound.mock.calls.find(([url]) => fetchUrl(url).includes("exp.host"));
    if (!push) throw new Error("Missing push");
    expect(JSON.parse(typeof push[1]?.body === "string" ? push[1].body : "null")).toMatchObject({
      title: "Alice in Team",
      body: "@Bob hello",
      data: { url: `/g/${groupId}?m=${message.sequence}` },
    });
  });
  it("device tokens move to the signed-in account and only their owner can unregister", async () => {
    const t = fixture();
    const { alice, bob } = await group(t);
    await alice.client.mutation(api.devices.registerExpo, {
      expoPushToken: "ExpoPushToken[shared]",
    });
    await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[shared]" });
    await alice.client.mutation(api.devices.unregister, { expoPushToken: "ExpoPushToken[shared]" });
    expect(await t.run((ctx) => ctx.db.query("devices").collect())).toMatchObject([
      { profileId: bob.id },
    ]);
    for (let index = 0; index < 11; index++)
      await bob.client.mutation(api.devices.registerExpo, {
        expoPushToken: `ExpoPushToken[token${index}]`,
      });
    expect(await t.run((ctx) => ctx.db.query("devices").collect())).toHaveLength(10);
  });
});
it("pure domain helpers preserve viewer copy and exact formatting", () => {
  expect(initials(" Alice Smith ")).toBe("AS");
  expect(eventSentence({ type: "created", by: { id: "a", name: "Alice", isYou: true } })).toBe(
    "You created this group",
  );
  expect(avatarColors("stable")).toEqual(avatarColors("stable"));
  expect(
    parseMentions("hi @BOB and @bob; mail@Alice", [
      { id: "b", name: "Bob Smith" },
      { id: "b2", name: "Bob Jones" },
      { id: "a", name: "Alice" },
    ]),
  ).toEqual(["b", "b2"]);
  expect(
    eventSentence({
      type: "removed",
      by: { id: "a", name: "Alice", isYou: false },
      person: { id: "b", name: "Bob", isYou: true },
    }),
  ).toBe("Alice removed you");
  expect(listPreview({ by: { id: "a", name: "Alice", isYou: true }, summary: "Hi" })).toBe(
    "You: Hi",
  );
  expect(fileSize(1024)).toBe("1 KB");
  expect(duration(62000)).toBe("1:02");
  const now = new Date(2026, 9, 18, 10, 42).getTime();
  expect(timeLabel(now, now)).toBe("10:42");
  expect(timeLabel(now - 86400000, now)).toBe("Yesterday");
});

describe("cron recovery and web dispatch", () => {
  it("resumes a failed account deletion through its registered supervisor and removes personal rows in batches", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const original = await send(bob.client, groupId, "kept after deletion", "kept");
    await bob.client.mutation(api.typing.start, { groupId });
    await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
    const reportable = await send(alice.client, groupId);
    await bob.client.mutation(api.reports.create, {
      messageId: reportable.messageId,
      reason: "other",
    });
    await bob.client.mutation(api.messages.react, { messageId: reportable.messageId, emoji: "👍" });
    await upload(bob.client);
    await drain(t);
    const prior = outbound.getMockImplementation();
    if (!prior) throw new Error("Missing mock");
    outbound.mockImplementation(async (input, init) =>
      init?.method === "DELETE" ? new Response(null, { status: 400 }) : prior(input, init),
    );
    await bob.client.mutation(api.profiles.deleteAccount, {});
    await drain(t, 1);
    expect(await t.run((ctx) => ctx.db.get(bob.id))).toMatchObject({ status: "deleting" });
    expect(
      await alice.client.query(api.messages.range, {
        groupId,
        fromSequence: original.sequence,
        toSequence: original.sequence,
      }),
    ).toMatchObject([{ author: { name: "Deleted account", deleted: true } }]);
    outbound.mockImplementation(prior);
    vi.setSystemTime(Date.now() + 600001);
    await fireCron(t, "resume account deletion");
    const tombstone = await t.run((ctx) => ctx.db.get(bob.id));
    expect(tombstone).toMatchObject({ status: "deleted" });
    expect(tombstone).not.toHaveProperty("authUserId");
    for (const table of [
      "memberships",
      "readStates",
      "unreadPosts",
      "removals",
      "typing",
      "devices",
      "reactions",
    ] as const) {
      const rows = await t.run((ctx) => ctx.db.query(table).collect());
      expect(rows.filter((value) => value.profileId === bob.id)).toEqual([]);
    }
    expect(await t.run((ctx) => ctx.db.query("uploads").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("reports").collect())).toEqual([]);
  });
  it("sweeps expired typing and unused upload bytes through the declared crons", async () => {
    const t = fixture();
    const { alice, groupId } = await group(t);
    await alice.client.mutation(api.typing.start, { groupId });
    const uploadId = await upload(alice.client);
    const stored = await t.run((ctx) => ctx.db.get(uploadId));
    if (!stored) throw new Error("Missing upload");
    vi.setSystemTime(Date.now() + 86400001);
    await fireCron(t, "expire typing");
    await fireCron(t, "expire unused uploads");
    expect(await t.run((ctx) => ctx.db.query("typing").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(uploadId))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.get(stored.storageId))).toBeNull();
  });
  it("encrypts web push, skips a currently viewed group, and delivers again after its lease expires", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const { generateVAPIDKeys } = await import("web-push");
    const vapid = generateVAPIDKeys();
    vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
    vi.stubEnv("VAPID_SUBJECT", "mailto:chat@q9labs.ai");
    const receiver = createECDH("prime256v1");
    const p256dh = receiver.generateKeys().toString("base64url");
    const auth = randomBytes(16).toString("base64url");
    const endpoint = "https://fcm.googleapis.com/fcm/send/test";
    await bob.client.mutation(api.devices.registerWeb, { endpoint, p256dh, auth });
    await bob.client.mutation(api.devices.viewing, { endpoint, groupId });
    await send(alice.client, groupId, "@Bob on screen");
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url) === endpoint)).toHaveLength(0);
    vi.setSystemTime(Date.now() + 60001);
    await send(alice.client, groupId, "@Bob notify", "after-expiry");
    await drain(t);
    const push = outbound.mock.calls.find(([url]) => fetchUrl(url) === endpoint);
    if (!push) throw new Error("Missing Web Push");
    expect(push[1]?.headers).toMatchObject({ "Content-Encoding": "aes128gcm" });
    expect(push[1]?.body).toBeInstanceOf(Uint8Array);
    await bob.client.mutation(api.devices.viewing, { endpoint, groupId });
    await bob.client.mutation(api.devices.viewing, { endpoint, groupId: null });
    await send(alice.client, groupId, "@Bob unfocused", "unfocused");
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url) === endpoint)).toHaveLength(2);
  });
  it("queued edits do not turn a previously unmentioned post into a notification", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
    const post = await send(alice.client, groupId, "ordinary");
    await alice.client.mutation(api.messages.edit, {
      messageId: post.messageId,
      body: "@Bob edited mention",
    });
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(
      0,
    );
    expect(await row(bob.client, groupId)).toMatchObject({ needsYou: false });
  });
});

// convex-test does not run recurring jobs. Simulate the platform firing the actual registered cron.
async function fireCron(t: Test, identifier: string) {
  const cron = crons.crons[identifier];
  if (!cron) throw new Error(`Missing cron ${identifier}`);
  await t.run(async (ctx) => {
    await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation", {}, null>(cron.name), {});
  });
  await drain(t);
}

describe("round-three regressions", () => {
  it("bounds undismissed removal notices at 20 without dropping older invite bans", async () => {
    const t = fixture();
    const alice = await account(t, "Alice"),
      bob = await account(t, "Bob");
    let oldest: Id<"groups"> | null = null;
    for (let index = 0; index < 21; index++) {
      const groupId = await alice.client.mutation(api.groups.create, {
        name: `Team ${index}`,
        memberIds: [bob.id],
        inviteToken: `NoticeToken${String(index).padStart(8, "0")}`,
      });
      oldest ??= groupId;
      await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
    }
    const notices = await bob.client.query(api.groups.list, {});
    expect(notices).toHaveLength(20);
    expect(notices.every((value) => value.status === "removed")).toBe(true);
    expect(notices.some((value) => value.groupId === oldest)).toBe(false);
    await expect(
      bob.client.mutation(api.groups.join, { token: "NoticeToken00000000" }),
    ).rejects.toThrow("removed_from_group");
    await drain(t);
  });
  it("keeps reaction counts exact through repeated join, react, leave, rejoin and account deletion", async () => {
    const t = fixture();
    const { alice, bob, carol, groupId } = await group(t);
    const post = await send(alice.client, groupId);
    for (let iteration = 0; iteration < 3; iteration++) {
      await bob.client.mutation(api.groups.join, { token: "TeamInvite12345678" });
      await bob.client.mutation(api.messages.react, { messageId: post.messageId, emoji: "👍" });
      await bob.client.mutation(api.messages.react, { messageId: post.messageId, emoji: "👍" });
      await bob.client.mutation(api.groups.leave, { groupId });
      expect(
        await alice.client.query(api.messages.reactors, { messageId: post.messageId }),
      ).toMatchObject([{ emoji: "👍", count: 1, people: [{ id: bob.id }] }]);
    }
    await bob.client.mutation(api.groups.join, { token: "TeamInvite12345678" });
    await bob.client.mutation(api.messages.react, { messageId: post.messageId, emoji: "❤️" });
    await carol.client.mutation(api.groups.join, { token: "TeamInvite12345678" });
    await carol.client.mutation(api.messages.react, { messageId: post.messageId, emoji: "❤️" });
    expect(
      await alice.client.query(api.messages.range, {
        groupId,
        fromSequence: post.sequence,
        toSequence: post.sequence,
      }),
    ).toMatchObject([{ reactions: [{ emoji: "❤️", count: 2, mine: false }] }]);
    await bob.client.mutation(api.profiles.deleteAccount, {});
    await drain(t);
    expect(
      await alice.client.query(api.messages.reactors, { messageId: post.messageId }),
    ).toMatchObject([{ emoji: "❤️", count: 1, people: [{ id: carol.id }] }]);
    await alice.client.mutation(api.messages.remove, { messageId: post.messageId });
    expect(await alice.client.query(api.messages.reactors, { messageId: post.messageId })).toEqual(
      [],
    );
    await drain(t);
    expect(await t.run((ctx) => ctx.db.query("reactions").collect())).toEqual([]);
  });
  it("a late cleanup from a removal cannot erase unread rows from the new membership", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await send(alice.client, groupId, "old", "old");
    await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
    await alice.client.mutation(api.groups.addMembers, { groupId, profileIds: [bob.id] });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 0 });
    const fresh = await send(alice.client, groupId, "fresh", "fresh");
    await drain(t);
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 1 });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("unreadPosts")
          .withIndex("by_profile_group_sequence", (q) =>
            q.eq("profileId", bob.id).eq("groupId", groupId),
          )
          .collect(),
      ),
    ).toMatchObject([{ sequence: fresh.sequence }]);
  });
  it("updates shared word-prefix directory lookup when a person changes their display name", async () => {
    const t = fixture();
    const { alice, bob } = await group(t);
    await bob.client.mutation(api.profiles.update, { displayName: "Bob Newname" });
    expect(await alice.client.query(api.people.find, { query: "newn" })).toMatchObject([
      { id: bob.id, fullName: "Bob Newname" },
    ]);
    await expect(
      bob.client.mutation(api.profiles.update, { displayName: "x".repeat(61) }),
    ).rejects.toThrow("name_too_long");
  });
  it("sniffed kinds cannot be changed by a declared MIME, post kind or photo update", async () => {
    const t = fixture();
    const { alice, groupId } = await group(t);
    const spoof = await upload(alice.client, "not a PNG", "image/png-spoof");
    await expect(
      alice.client.mutation(api.profiles.update, { photoUploadId: spoof }),
    ).rejects.toThrow("bad_attachment");
    await expect(
      alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: "spoof",
        body: "",
        attachments: [{ kind: "image", uploadId: spoof, width: 100, height: 100 }],
      }),
    ).rejects.toThrow("bad_attachment");
    await alice.client.mutation(api.messages.send, {
      groupId,
      clientKey: "realfile",
      body: "",
      attachments: [{ kind: "file", uploadId: spoof, name: "file.bin" }],
    });
    await drain(t);
  });
});

describe("bounded API limits", () => {
  it("enforces 100 groups per person and 100 people per group with distinct errors", async () => {
    const t = fixture();
    const alice = await account(t, "Alice");
    for (let index = 0; index < 100; index++)
      await alice.client.mutation(api.groups.create, {
        name: "Team",
        memberIds: [],
        inviteToken: `GroupCap${String(index).padStart(12, "0")}`,
      });
    await expect(
      alice.client.mutation(api.groups.create, {
        name: "Overflow",
        memberIds: [],
        inviteToken: "GroupCapOverflow123",
      }),
    ).rejects.toThrow("too_many_groups");
    expect(await alice.client.query(api.groups.list, {})).toHaveLength(100);
    const other = fixture();
    const owner = await account(other, "Owner");
    const people = [];
    for (let index = 0; index < 100; index++)
      people.push((await account(other, `Person${index}`)).id);
    await expect(
      owner.client.mutation(api.groups.create, {
        name: "Too large",
        memberIds: people,
        inviteToken: "MemberCapOverflow123",
      }),
    ).rejects.toThrow("group_full");
  });
  it("returns counts without reactor names in range and only ten names on demand", async () => {
    const t = fixture();
    const { alice, groupId } = await group(t);
    const post = await send(alice.client, groupId);
    for (let index = 0; index < 12; index++) {
      const person = await account(t, `Reactor${index}`);
      await person.client.mutation(api.groups.join, { token: "TeamInvite12345678" });
      await person.client.mutation(api.messages.react, { messageId: post.messageId, emoji: "👍" });
    }
    const page = await alice.client.query(api.messages.range, {
      groupId,
      fromSequence: post.sequence,
      toSequence: post.sequence,
    });
    expect(page).toMatchObject([{ reactions: [{ emoji: "👍", count: 12, mine: false }] }]);
    const postResult = page[0];
    if (postResult?.kind !== "post") throw new Error("Expected post");
    expect(postResult.reactions[0]).not.toHaveProperty("people");
    const reactors = await alice.client.query(api.messages.reactors, { messageId: post.messageId });
    expect(reactors[0]?.count).toBe(12);
    expect(reactors[0]?.people).toHaveLength(10);
    await drain(t);
  });
  it("search batches more than ten groups and takes ten matches from each group", async () => {
    const t = fixture();
    const alice = await account(t, "Alice");
    for (let index = 0; index < 11; index++) {
      const groupId = await alice.client.mutation(api.groups.create, {
        name: `Search ${index}`,
        memberIds: [],
        inviteToken: `SearchToken${String(index).padStart(8, "0")}`,
      });
      for (let post = 0; post < (index === 0 ? 12 : 1); post++)
        await send(alice.client, groupId, "needle", `${index}-${post}`);
    }
    const hits = await alice.client.action(api.messages.search, { query: "need" });
    expect(hits).toHaveLength(20);
    expect(hits.filter((hit) => hit.groupTitle === "Search 0")).toHaveLength(10);
    await expect(
      alice.client.action(api.messages.search, { query: "x".repeat(101) }),
    ).rejects.toThrow("Query exceeds 100");
    await drain(t);
  });
  it("clears moved browser viewing leases and prevents another account from clearing or unregistering them", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    const endpoint = "https://fcm.googleapis.com/fcm/send/ownership";
    await alice.client.mutation(api.devices.registerWeb, {
      endpoint,
      ...pushKeys(),
    });
    await alice.client.mutation(api.devices.viewing, { endpoint, groupId });
    await bob.client.mutation(api.devices.viewing, { endpoint, groupId: null });
    await bob.client.mutation(api.devices.unregister, { endpoint });
    expect(await t.run((ctx) => ctx.db.query("devices").collect())).toMatchObject([
      { profileId: alice.id, viewing: { groupId } },
    ]);
    await bob.client.mutation(api.devices.registerWeb, { endpoint, ...pushKeys() });
    const rows = await t.run((ctx) => ctx.db.query("devices").collect());
    expect(rows[0]).toMatchObject({ profileId: bob.id });
    expect(rows[0]).not.toHaveProperty("viewing");
  });
});

it("deleted reply quotes retain the original author and viewer identity", async () => {
  const t = fixture();
  const { alice, bob, groupId } = await group(t);
  const original = await send(alice.client, groupId, "original");
  const reply = await bob.client.mutation(api.messages.send, {
    groupId,
    clientKey: "quote",
    body: "reply",
    replyToId: original.messageId,
    attachments: [],
  });
  await alice.client.mutation(api.messages.remove, { messageId: original.messageId });
  const args = { groupId, fromSequence: reply.sequence, toSequence: reply.sequence };
  expect(await alice.client.query(api.messages.range, args)).toMatchObject([
    {
      replyTo: {
        id: original.messageId,
        sequence: original.sequence,
        deleted: true,
        author: { id: alice.id, name: "Alice", isYou: true },
      },
    },
  ]);
  expect(await bob.client.query(api.messages.range, args)).toMatchObject([
    { replyTo: { deleted: true, author: { id: alice.id, isYou: false } } },
  ]);
  await drain(t);
});

it("review probe groups.list with 42 disjoint 100-member groups", async () => {
  const t = fixture();
  const owner = await account(t, "Owner");
  for (let i = 0; i < 42; i++) {
    const ids = await t.run(async (ctx) => {
      const inserted = [];
      for (let j = 0; j < 99; j++)
        inserted.push(
          await ctx.db.insert("profiles", {
            status: "active",
            authUserId: `g${i}m${j}`,
            email: `g${i}m${j}@example.com`,
            displayName: `Member${j} Person`,
          }),
        );
      return inserted;
    });
    await owner.client.mutation(api.groups.create, {
      name: "Team",
      memberIds: ids,
      inviteToken: `ReviewGroup${String(i).padStart(10, "0")}`,
    });
  }
  await expect(owner.client.query(api.groups.list, {})).resolves.toHaveLength(42);
}, 60000);
it("review probe messages.range with 100 mentions in each of 100 posts", async () => {
  const t = fixture();
  const owner = await account(t, "Owner", "A Owner");
  const ids = await t.run(async (ctx) => {
    const inserted = [owner.id];
    for (let i = 0; i < 99; i++)
      inserted.push(
        await ctx.db.insert("profiles", {
          status: "active",
          authUserId: `p${i}`,
          email: `p${i}@example.com`,
          displayName: "A Person",
        }),
      );
    return inserted;
  });
  const groupId = await owner.client.mutation(api.groups.create, {
    name: "Team",
    memberIds: ids,
    inviteToken: "ReviewRange1234567",
  });
  await t.run(async (ctx) => {
    for (let i = 3; i <= 102; i++)
      await ctx.db.insert("messages", {
        kind: "post",
        groupId,
        sequence: i,
        authorId: owner.id,
        clientKey: String(i),
        body: "@A",
        searchText: "@A",
        mentions: ids,
        attachments: [],
        reactionCounts: [],
      });
    await ctx.db.patch(groupId, { lastSequence: 102 });
  });
  const page = await owner.client.query(api.messages.range, {
    groupId,
    fromSequence: 3,
    toSequence: 102,
  });
  expect(page).toHaveLength(100);
  for (const post of page) {
    if (post.kind !== "post") throw new Error("Missing post");
    expect(post.mentions).toEqual(ids);
  }
});
it("review probe full length message stays within push payload budget", async () => {
  const t = fixture();
  const { alice, bob, groupId } = await group(t);
  await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
  await send(alice.client, groupId, "@Bob " + "界".repeat(3995));
  await drain(t);
  const push = outbound.mock.calls.find(([url]) => fetchUrl(url).includes("exp.host"));
  if (!push || typeof push[1]?.body !== "string") throw new Error("No push");
  const bytes = new TextEncoder().encode(push[1].body).length;

  expect(bytes).toBeLessThanOrEqual(4096);
});
it("review probe push retry rechecks eligibility after muting", async () => {
  const t = fixture();
  const { alice, bob, groupId } = await group(t);
  await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
  let pushes = 0;
  outbound.mockImplementation(async (input) => {
    if (fetchUrl(input).includes("exp.host")) {
      pushes++;
      if (pushes === 1) {
        await bob.client.mutation(api.groups.setNotify, { groupId, notify: "muted" });
        return new Response(null, { status: 500 });
      }
      return Response.json({ data: { status: "ok" } });
    }
    throw new Error("unexpected call");
  });
  await send(alice.client, groupId, "@Bob private message");
  await drain(t);

  expect(pushes).toBe(1);
});

it("review probe deleting name matches do not hide an active result", async () => {
  const t = fixture();
  const owner = await account(t, "Owner");
  const ids = await t.run(async (ctx) => {
    const inserted = [];
    for (let i = 0; i < 5; i++)
      inserted.push(
        await ctx.db.insert("profiles", {
          status: "active",
          authUserId: `match${i}`,
          email: `match${i}@example.com`,
          displayName: "Match Person",
        }),
      );
    return inserted;
  });
  const groupId = await owner.client.mutation(api.groups.create, {
    name: "Team",
    memberIds: ids,
    inviteToken: "ReviewPeople123456",
  });
  const ordered = await t.run((ctx) =>
    ctx.db
      .query("memberships")
      .withIndex("by_group_profile", (q) => q.eq("groupId", groupId))
      .collect(),
  );
  const matches = ordered.filter((r) => r.profileId !== owner.id);
  for (const match of matches.slice(0, 4)) {
    const profile = await t.run((ctx) => ctx.db.get(match.profileId));
    if (profile?.status !== "active") throw new Error("Missing active fixture");
    await t.withIdentity({ subject: profile.authUserId }).mutation(api.profiles.deleteAccount, {});
  }

  expect(await owner.client.query(api.people.find, { query: "Match" })).toHaveLength(1);
  await drain(t);
});
it("review probe forbidden push hosts are rejected", async () => {
  const t = fixture();
  const alice = await account(t, "Alice");
  for (const endpoint of [
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://evil.test/fcm.googleapis.com",
    "https://user:pass@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "http://fcm.googleapis.com/x",
  ])
    await expect(
      alice.client.mutation(api.devices.registerWeb, { endpoint, p256dh: "test", auth: "test" }),
    ).rejects.toThrow("Invalid push subscription");
});
it("review probe push retry rechecks membership after removal", async () => {
  const t = fixture();
  const { alice, bob, groupId } = await group(t);
  await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
  let pushes = 0;
  outbound.mockImplementation(async (input) => {
    if (fetchUrl(input).includes("exp.host")) {
      pushes++;
      if (pushes === 1) {
        await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
        return new Response(null, { status: 500 });
      }
      return Response.json({ data: { status: "ok" } });
    }
    throw new Error("unexpected call");
  });
  await send(alice.client, groupId, "@Bob private message");
  await drain(t);
  expect(pushes).toBe(1);
});

it("review probe Expo error ticket does not masquerade as successful delivery", async () => {
  const t = fixture();
  const { alice, bob, groupId } = await group(t);
  await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
  outbound.mockImplementation(async () =>
    Response.json({
      data: {
        status: "error",
        message: "Device is not registered",
        details: { error: "DeviceNotRegistered" },
      },
    }),
  );
  await send(alice.client, groupId, "@Bob ping");
  await drain(t);
  expect(await t.run((ctx) => ctx.db.query("devices").collect())).toHaveLength(0);
});
it("accepts an Ogg signature without parsing its codecs", async () => {
  const t = fixture();
  const { alice, groupId } = await group(t);
  const uploadId = await upload(alice.client, "OggS");
  await expect(
    alice.client.mutation(api.messages.send, {
      groupId,
      clientKey: "signature-only",
      body: "",
      attachments: [{ kind: "voice", uploadId, durationMs: 1000, waveform: [0.5] }],
    }),
  ).resolves.toBeDefined();
  await drain(t);
});

it("bounds timeline added events to three people and an others count", async () => {
  const t = fixture();
  const owner = await account(t, "Owner");
  const groupId = await owner.client.mutation(api.groups.create, {
    name: "Team",
    memberIds: [],
    inviteToken: "BoundedEvent123456",
  });
  for (let i = 2; i <= 101; i++) {
    await t.run(async (ctx) => {
      const inserted = [];
      for (let j = 0; j < 99; j++)
        inserted.push(
          await ctx.db.insert("profiles", {
            status: "active",
            authUserId: `event${i}-${j}`,
            email: `e${i}-${j}@example.com`,
            displayName: "Past Member",
          }),
        );
      await ctx.db.insert("messages", {
        kind: "event",
        groupId,
        sequence: i,
        event: { type: "added", by: owner.id, profileIds: inserted },
      });
    });
  }
  const page = await owner.client.query(api.messages.range, {
    groupId,
    fromSequence: 2,
    toSequence: 101,
  });
  expect(page).toHaveLength(100);
  for (const message of page) {
    expect(message).toMatchObject({ kind: "event", event: { type: "added", othersCount: 96 } });
    if (message.kind !== "event" || message.event.type !== "added")
      throw new Error("Missing event");
    expect(message.event.people).toHaveLength(3);
  }
  expect(await owner.client.query(api.groups.list, {})).toMatchObject([
    { preview: { summary: "You added Past, Past, Past and 96 others" } },
  ]);
  await drain(t);
});

it("caps worst-case CJK Expo JSON and encrypted Web Push payloads below 4096 bytes", async () => {
  const t = fixture();
  const alice = await account(t, "Alice", "界".repeat(60));
  const bob = await account(t, "Bob");
  const groupId = await alice.client.mutation(api.groups.create, {
    name: "界".repeat(80),
    memberIds: [bob.id],
    inviteToken: "WorstPayload123456",
  });
  await bob.client.mutation(api.groups.setNotify, { groupId, notify: "all" });
  await bob.client.mutation(api.devices.registerExpo, {
    expoPushToken: `ExpoPushToken[${"x".repeat(185)}]`,
  });
  const { generateVAPIDKeys } = await import("web-push");
  const vapid = generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:chat@q9labs.ai");
  await bob.client.mutation(api.devices.registerWeb, {
    endpoint: "https://fcm.googleapis.com/fcm/send/budget",
    ...pushKeys(),
  });
  await send(alice.client, groupId, "界".repeat(4000));
  await drain(t);
  const pushes = outbound.mock.calls.filter(([input]) => !fetchUrl(input).includes("workos.com"));
  expect(pushes).toHaveLength(2);
  for (const [, init] of pushes) {
    const body = init?.body;
    if (typeof body === "string") {
      expect(new TextEncoder().encode(body).length).toBeLessThanOrEqual(4096);
      expect(JSON.parse(body)).toMatchObject({ body: "界".repeat(200) + "…" });
    } else if (body instanceof Uint8Array) expect(body.byteLength).toBeLessThanOrEqual(4096);
    else throw new Error("Missing serialized push payload");
  }
});

it("stops a web retry when a viewing lease is created after the failed attempt", async () => {
  const t = fixture();
  const { alice, bob, groupId } = await group(t);
  const { generateVAPIDKeys } = await import("web-push");
  const vapid = generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:chat@q9labs.ai");
  const endpoint = "https://fcm.googleapis.com/fcm/send/retry";
  await bob.client.mutation(api.devices.registerWeb, { endpoint, ...pushKeys() });
  let pushes = 0;
  outbound.mockImplementation(async () => {
    pushes++;
    await bob.client.mutation(api.devices.viewing, { endpoint, groupId });
    return new Response(null, { status: 500 });
  });
  await send(alice.client, groupId, "@Bob private");
  await drain(t);
  expect(pushes).toBe(1);
});

it.each([404, 410])("discards a dead web device on HTTP %i", async (status) => {
  const t = fixture();
  const { alice, bob, groupId } = await group(t);
  const { generateVAPIDKeys } = await import("web-push");
  const vapid = generateVAPIDKeys();
  vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:chat@q9labs.ai");
  await bob.client.mutation(api.devices.registerWeb, {
    endpoint: "https://fcm.googleapis.com/fcm/send/dead",
    ...pushKeys(),
  });
  outbound.mockResolvedValue(new Response(null, { status }));
  await send(alice.client, groupId, "@Bob ping");
  await drain(t);
  expect(await t.run((ctx) => ctx.db.query("devices").collect())).toHaveLength(0);
});

it("does not discard a device transferred while its old ticket is in flight", async () => {
  const t = fixture();
  const { alice, bob, carol, groupId } = await group(t);
  const expoPushToken = "ExpoPushToken[transfer]";
  await bob.client.mutation(api.devices.registerExpo, { expoPushToken });
  outbound.mockImplementation(async () => {
    await carol.client.mutation(api.devices.registerExpo, { expoPushToken });
    return Response.json({ data: { status: "error", details: { error: "DeviceNotRegistered" } } });
  });
  await send(alice.client, groupId, "@Bob ping");
  await drain(t);
  expect(await t.run((ctx) => ctx.db.query("devices").collect())).toMatchObject([
    { profileId: carol.id },
  ]);
});

it("rejects invalid web key lengths and the wrong public-key prefix", async () => {
  const t = fixture();
  const alice = await account(t, "Alice");
  const keys = pushKeys();
  for (const invalid of [
    { ...keys, p256dh: "test" },
    { ...keys, auth: "test" },
    { ...keys, p256dh: Buffer.alloc(65).toString("base64url") },
  ])
    await expect(
      alice.client.mutation(api.devices.registerWeb, {
        endpoint: "https://fcm.googleapis.com/fcm/send/key",
        ...invalid,
      }),
    ).rejects.toThrow("Invalid push subscription");
});

it("classifies real containers by signature without parsing their tracks", async () => {
  const { readFile } = await import("node:fs/promises");
  const t = fixture();
  const { alice, groupId } = await group(t);
  for (const name of ["voice.ogg", "voice.webm", "voice.m4a", "video.webm", "video.m4a"]) {
    const bytes = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
    const response = await alice.client.fetch("/upload", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "audio/mp4" },
      body: new Uint8Array(bytes),
    });
    const id = await t.run(async (ctx) => {
      const rows = await ctx.db.query("uploads").collect();
      return rows.at(-1)?._id;
    });
    expect(response.status).toBe(200);
    if (!id) throw new Error("Missing upload");
    const sendVoice = alice.client.mutation(api.messages.send, {
      groupId,
      clientKey: name,
      body: "",
      attachments: [{ kind: "voice", uploadId: id, durationMs: 50, waveform: [0] }],
    });
    await expect(sendVoice).resolves.toBeDefined();
  }
  for (const bytes of [
    "OggS",
    "OggSvorbis",
    "0000ftypM4A ",
    "OggS" + "x".repeat(65536) + "OpusHead",
  ]) {
    const uploadId = await upload(alice.client, bytes);
    await expect(
      alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: bytes.slice(0, 16) + String(bytes.length),
        body: "",
        attachments: [{ kind: "voice", uploadId, durationMs: 50, waveform: [0] }],
      }),
    ).resolves.toBeDefined();
  }
  await drain(t);
});

it.each(["long.m4a", "noise.webm", "raw.aac"])(
  "accepts the real voice regression fixture %s as voice or File with single use",
  async (name) => {
    const { readFile } = await import("node:fs/promises");
    const t = fixture();
    const { alice, groupId } = await group(t);
    const bytes = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
    const response = await alice.client.fetch("/upload", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/octet-stream" },
      body: new Uint8Array(bytes),
    });
    expect(response.status).toBe(200);
    const uploadId = await t.run(async (ctx) => {
      const rows = await ctx.db.query("uploads").collect();
      return rows.at(-1)?._id;
    });
    if (!uploadId) throw new Error("Missing upload");
    await expect(
      alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: "wrong-kind",
        body: "",
        attachments: [{ kind: "image", uploadId, width: 1, height: 1 }],
      }),
    ).rejects.toThrow("bad_attachment");
    await expect(
      alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: "voice",
        body: "",
        attachments: [{ kind: "voice", uploadId, durationMs: 10000, waveform: [0] }],
      }),
    ).resolves.toBeDefined();
    await expect(
      alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: "used-again",
        body: "",
        attachments: [{ kind: "voice", uploadId, durationMs: 10000, waveform: [0] }],
      }),
    ).rejects.toThrow("bad_attachment");
    const fileResponse = await alice.client.fetch("/upload", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/octet-stream" },
      body: new Uint8Array(bytes),
    });
    expect(fileResponse.status).toBe(200);
    const fileUploadId = await t.run(
      async (ctx) => (await ctx.db.query("uploads").collect()).at(-1)?._id,
    );
    if (!fileUploadId) throw new Error("Missing file upload");
    await expect(
      alice.client.mutation(api.messages.send, {
        groupId,
        clientKey: "file",
        body: "",
        attachments: [{ kind: "file", uploadId: fileUploadId, name }],
      }),
    ).resolves.toBeDefined();
    await drain(t);
  },
);

it("rejects an off-curve P-256 point before storing a web subscription", async () => {
  const t = fixture();
  const alice = await account(t, "Alice");
  const keys = pushKeys();
  const offCurve = Buffer.alloc(65);
  offCurve[0] = 4;
  const endpoint = "https://fcm.googleapis.com/fcm/send/curve";
  await expect(
    alice.client.mutation(api.devices.registerWeb, {
      endpoint,
      ...keys,
      p256dh: offCurve.toString("base64url"),
    }),
  ).rejects.toThrow("Invalid push subscription");
  expect(await t.run((ctx) => ctx.db.query("devices").collect())).toHaveLength(0);
  await expect(
    alice.client.mutation(api.devices.registerWeb, { endpoint, ...keys }),
  ).resolves.toBeNull();
  expect(await t.run((ctx) => ctx.db.query("devices").collect())).toHaveLength(1);
});
