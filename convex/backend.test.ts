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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import crons from "./crons";
import { makeFunctionReference } from "convex/server";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./vitest.config.ts"]);
const outbound = vi.fn<typeof fetch>();
const fetchUrl = (input: Parameters<typeof fetch>[0]) => input instanceof Request ? input.url : input.toString();
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
  return convexTest(schema, modules);
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
    inviteToken: "TeamInvite1234",
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
    body,
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
async function drain(t: Test) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}
async function row(client: Test, groupId: Id<"groups">) {
  const rows = await client.query(api.groups.list, {});
  return rows.find((value) => value.groupId === groupId);
}
describe("identity and access classes", () => {
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
      email: "new@example.com",
      suggestedName: "New",
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
      inviteToken: "AnotherToken123",
    });
    expect(await alice.client.query(api.groups.get, { groupId: id })).toMatchObject({
      title: "Bob",
    });
    await expect(
      alice.client.mutation(api.groups.create, { memberIds: [], inviteToken: "BlankToken1234" }),
    ).rejects.toThrow("name_required");
    await expect(
      alice.client.mutation(api.groups.create, {
        name: "Dup",
        memberIds: [],
        inviteToken: "TeamInvite1234",
      }),
    ).rejects.toThrow("invite_invalid");
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
    expect(await bob.client.query(api.groups.inviteInfo, { token: "TeamInvite1234" })).toEqual({
      status: "removed",
    });
    await bob.client.mutation(api.groups.dismissRemoval, { groupId });
    expect(await bob.client.query(api.groups.list, {})).toEqual([]);
    await expect(bob.client.mutation(api.groups.join, { token: "TeamInvite1234" })).rejects.toThrow(
      "removed_from_group",
    );
    await alice.client.mutation(api.groups.addMembers, { groupId, profileIds: [bob.id, bob.id] });
    await alice.client.mutation(api.groups.addMembers, { groupId, profileIds: [bob.id] });
    expect(await alice.client.query(api.groups.get, { groupId })).toMatchObject({
      lastSequence: 4,
      memberCount: 2,
    });
    expect(await bob.client.mutation(api.groups.join, { token: "TeamInvite1234" })).toBe(groupId);
  });
  it("leave is a no-op for outsiders and repeated calls, while valid invite joining adds one event", async () => {
    const t = fixture();
    const { alice, bob, carol, groupId } = await group(t);
    await carol.client.mutation(api.groups.leave, { groupId });
    expect(
      await carol.client.query(api.groups.inviteInfo, { token: "TeamInvite1234" }),
    ).toMatchObject({ status: "open", title: "Team", memberCount: 2 });
    await carol.client.mutation(api.groups.join, { token: "TeamInvite1234" });
    await carol.client.mutation(api.groups.join, { token: "TeamInvite1234" });
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
      { id: bob.id },
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
    await alice.client.mutation(api.messages.remove, { messageId: first.messageId });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 100 });
    await bob.client.mutation(api.readStates.markRead, { groupId, sequence: 103 });
    expect(await row(bob.client, groupId)).toMatchObject({ unreadCount: 1 });
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
    ).toMatchObject([
      { reactions: [{ emoji: "❤️", count: 1, mine: true, people: [{ id: bob.id, isYou: true }] }] },
    ]);
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
    expect(await bob.client.query(api.messages.search, { query: "Test" })).toHaveLength(1);
    expect(await carol.client.query(api.messages.search, { query: "Test", groupId })).toEqual([]);
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
    expect(await bob.client.query(api.messages.search, { query: "Test" })).toEqual([]);
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
  it("rejects unauthenticated, oversized and unsupported upload types; photo consumption is single-use", async () => {
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
    ).toBe(415);
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
    ).toBe("photo");
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
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(0);
    await bob.client.mutation(api.groups.setNotify, { groupId, notify: "all" });
    await send(alice.client, groupId, "all", "all");
    await alice.client.mutation(api.groups.removeMember, { groupId, profileId: bob.id });
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(0);
    await alice.client.mutation(api.groups.addMembers, { groupId, profileIds: [bob.id] });
    await send(alice.client, groupId, "@Bob", "deleted");
    await bob.client.mutation(api.profiles.deleteAccount, {});
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(0);
  });
  it("delivers mention and reply with summary and deep link; skips unrelated default posts", async () => {
    const t = fixture();
    const { alice, bob, groupId } = await group(t);
    await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
    await send(alice.client, groupId, "ordinary");
    await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(0);
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
    const t = fixture(); const { alice, bob, groupId } = await group(t);
    const original = await send(bob.client, groupId, "kept after deletion", "kept");
    await bob.client.mutation(api.typing.start, { groupId });
    await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
    const reportable = await send(alice.client, groupId);
    await bob.client.mutation(api.reports.create, { messageId: reportable.messageId, reason: "other" });
    await bob.client.mutation(api.messages.react, { messageId: reportable.messageId, emoji: "👍" });
    await upload(bob.client);
    await drain(t);
    const prior = outbound.getMockImplementation(); if (!prior) throw new Error("Missing mock");
    outbound.mockImplementation(async (input, init) => init?.method === "DELETE" ? new Response(null, { status: 400 }) : prior(input, init));
    await bob.client.mutation(api.profiles.deleteAccount, {}); await drain(t);
    expect(await t.run(ctx => ctx.db.get(bob.id))).toMatchObject({ status: "deleting" });
    expect(await alice.client.query(api.messages.range, { groupId, fromSequence: original.sequence, toSequence: original.sequence })).toMatchObject([{ author: { name: "Deleted account", deleted: true } }]);
    outbound.mockImplementation(prior);
    vi.setSystemTime(Date.now() + 600001);
    await fireCron(t, "resume account deletion");
    const tombstone = await t.run(ctx => ctx.db.get(bob.id)); expect(tombstone).toMatchObject({ status: "deleted" }); expect(tombstone).not.toHaveProperty("authUserId");
    for (const table of ["memberships", "readStates", "unreadPosts", "removals", "typing", "devices", "reactions"] as const) {
      const rows = await t.run(ctx => ctx.db.query(table).collect()); expect(rows.filter(value => value.profileId === bob.id)).toEqual([]);
    }
    expect(await t.run(ctx => ctx.db.query("uploads").collect())).toEqual([]); expect(await t.run(ctx => ctx.db.query("reports").collect())).toEqual([]);
  });
  it("sweeps expired typing and unused upload bytes through the declared crons", async () => {
    const t = fixture(); const { alice, groupId } = await group(t);
    await alice.client.mutation(api.typing.start, { groupId }); const uploadId = await upload(alice.client);
    const stored = await t.run(ctx => ctx.db.get(uploadId)); if (!stored) throw new Error("Missing upload");
    vi.setSystemTime(Date.now() + 86400001);
    await fireCron(t, "expire typing"); await fireCron(t, "expire unused uploads");
    expect(await t.run(ctx => ctx.db.query("typing").collect())).toEqual([]); expect(await t.run(ctx => ctx.db.get(uploadId))).toBeNull(); expect(await t.run(ctx => ctx.storage.get(stored.storageId))).toBeNull();
  });
  it("encrypts web push, skips a currently viewed group, and delivers again after its lease expires", async () => {
    const t = fixture(); const { alice, bob, groupId } = await group(t);
    const { generateVAPIDKeys } = await import("web-push");
    const { createECDH, randomBytes } = await import("node:crypto");
    const vapid = generateVAPIDKeys(); vi.stubEnv("VAPID_PUBLIC_KEY", vapid.publicKey); vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey); vi.stubEnv("VAPID_SUBJECT", "mailto:chat@q9labs.ai");
    const receiver = createECDH("prime256v1"); const p256dh = receiver.generateKeys().toString("base64url"); const auth = randomBytes(16).toString("base64url");
    const endpoint = "https://fcm.googleapis.com/fcm/send/test";
    await bob.client.mutation(api.devices.registerWeb, { endpoint, p256dh, auth }); await bob.client.mutation(api.devices.viewing, { endpoint, groupId });
    await send(alice.client, groupId, "@Bob on screen"); await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url) === endpoint)).toHaveLength(0);
    vi.setSystemTime(Date.now() + 60001); await send(alice.client, groupId, "@Bob notify", "after-expiry"); await drain(t);
    const push = outbound.mock.calls.find(([url]) => fetchUrl(url) === endpoint); if (!push) throw new Error("Missing Web Push");
    expect(push[1]?.headers).toMatchObject({ "Content-Encoding": "aes128gcm" }); expect(push[1]?.body).toBeInstanceOf(Uint8Array);
    await bob.client.mutation(api.devices.viewing, { endpoint, groupId }); await bob.client.mutation(api.devices.viewing, { endpoint, groupId: null });
    await send(alice.client, groupId, "@Bob unfocused", "unfocused"); await drain(t); expect(outbound.mock.calls.filter(([url]) => fetchUrl(url) === endpoint)).toHaveLength(2);
  });
  it("queued edits do not turn a previously unmentioned post into a notification", async () => {
    const t = fixture(); const { alice, bob, groupId } = await group(t); await bob.client.mutation(api.devices.registerExpo, { expoPushToken: "ExpoPushToken[bob]" });
    const post = await send(alice.client, groupId, "ordinary"); await alice.client.mutation(api.messages.edit, { messageId: post.messageId, body: "@Bob edited mention" }); await drain(t);
    expect(outbound.mock.calls.filter(([url]) => fetchUrl(url).includes("exp.host"))).toHaveLength(0); expect(await row(bob.client, groupId)).toMatchObject({ needsYou: false });
  });
});

// convex-test does not run recurring jobs. Simulate the platform firing the actual registered cron.
async function fireCron(t: Test, identifier: string) {
  const cron = crons.crons[identifier]; if (!cron) throw new Error(`Missing cron ${identifier}`);
  await t.run(async ctx => { await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation", {}, null>(cron.name), {}); });
  await drain(t);
}
