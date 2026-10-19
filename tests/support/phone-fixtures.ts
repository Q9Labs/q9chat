import { randomUUID } from "node:crypto";

import { api, type Id } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { expect, type Locator, type Screen } from "e2e";

import { magicCode, signInPhone, type PhoneSession } from "./workos.js";

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

export async function enterPhoneEmailCode(
  p: {
    screen: Screen;
    enter: (field: Locator, text: string) => Promise<void>;
    enterCode: (code: string) => Promise<void>;
  },
  email: string,
) {
  await p.enter(p.screen.getByLabel("Email"), email);
  await p.screen.getByRole("button", "Email me a code").tap();
  await expect(p.screen.getByText("Check your email")).toBeVisible();
  await p.enterCode(await magicCode(email));
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

export function phoneEmails(lane: string) {
  const stamp = randomUUID().slice(0, 8);
  const email = `q9-${lane}-phone-${stamp}@example.net`;
  const peerEmail = `q9-${lane}-peer-${stamp}@example.net`;
  return { stamp, email, peerEmail, emails: [email, peerEmail] };
}
export async function signInPhoneUi(
  p: {
    screen: Screen;
    enter: (field: Locator, value: string) => Promise<void>;
    submitEmail?: () => Promise<void>;
    enterCode?: (code: string) => Promise<void>;
  },
  email: string,
) {
  await p.enter(p.screen.getByLabel("Email"), email);
  const submit = p.submitEmail ?? (() => p.screen.getByRole("button", "Email me a code").tap());
  await submit();
  await expect(p.screen.getByText("Check your email")).toBeVisible();
  const enterCode =
    p.enterCode ??
    ((code: string) => p.screen.getByLabel("6-digit code").pressSequentially(code, { delay: 80 }));
  await enterCode(await magicCode(email));
}
