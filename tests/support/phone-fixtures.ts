import { randomUUID } from "node:crypto";

import { api, type Id } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect, type Screen } from "e2e";

import { signInPhone, type PhoneSession } from "./workos.js";

export async function createPhoneAccount(email: string, name: string, sessions: PhoneSession[]) {
  const session = await signInPhone(email);
  sessions.push(session);
  const client = new ConvexHttpClient("https://quixotic-crab-23.convex.cloud");
  client.setAuth(session.accessToken);
  await client.action(api.profiles.setUp, { displayName: name });
  const me = await client.query(api.profiles.me, {});
  if (me?.status !== "ready") throw new Error("Missing seeded profile");
  return { client, id: me.profile.id };
}

export function createPhoneGroup(client: ConvexHttpClient, name: string, memberId: Id<"profiles">) {
  return client.mutation(api.groups.create, {
    name,
    memberIds: [memberId],
    inviteToken: randomUUID().replaceAll("-", ""),
  });
}

export async function signOutPhone(screen: Screen) {
  await screen.getByRole("button", "Back to groups").tap();
  await screen.getByRole("button", "Account", { exact: true }).tap();
  await screen.getByRole("button", "Sign out", { exact: true }).tap();
  await expect(screen.getByRole("button", "Continue with Google")).toBeVisible();
}
