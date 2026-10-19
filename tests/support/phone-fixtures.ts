import { api } from "@q9chat/convex";
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
