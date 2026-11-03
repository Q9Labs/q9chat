import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test } from "@e2e-dev/mobile";
import { api } from "@q9chat/convex";
import { expect } from "e2e";
import { Schema } from "effect";

import { adb, adbShell, openDevClient } from "./support/android.js";
import { createPhoneAccount, signInPhoneUi } from "./support/phone-fixtures.js";
import { deletePhoneProfile, removeTestUser, type PhoneSession } from "./support/workos.js";

const platform = process.env["J8_PLATFORM"] === "android" ? "android" : "ios";
const realDelivery = platform === "android" || process.env["J8_REAL_IOS"] === "1";
const udid = "DC55017E-BBF2-42B4-A00C-6B08864EFF51";
const output = join("artifacts", `j8-${platform}`);
mkdirSync(output, { recursive: true });
function simctl(...args: string[]) {
  return execFileSync("xcrun", ["simctl", ...args], { encoding: "utf8", timeout: 30_000 });
}
function expoDevices(profileId: string) {
  let text: string;
  try {
    text = execFileSync(
      "pnpm",
      ["exec", "convex", "run", "notificationData:devices", JSON.stringify({ profileId })],
      {
        encoding: "utf8",
        timeout: 30_000,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, CONVEX_DEPLOYMENT: "dev:quixotic-crab-23" },
      },
    );
  } catch {
    throw new Error("Could not inspect dev notification registrations");
  }
  const rows = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ kind: Schema.String })))(
    JSON.parse(text),
  );
  return rows.filter((row) => row.kind === "expo").length;
}

function shot(name: string) {
  const path = join(output, `${name}.png`);
  if (platform === "android") writeFileSync(path, adb("exec-out", "screencap", "-p"));
  else simctl("io", udid, "screenshot", path);
}

type Phone = Parameters<Parameters<typeof test>[2]>[0];
async function signIn(screen: Phone["screen"], email: string) {
  await signInPhoneUi(
    {
      screen,
      enter: (field, value) =>
        platform === "ios" ? field.pressSequentially(value, { delay: 60 }) : field.fill(value),
    },
    email,
  );
}
async function resetPhone({ app, device }: Pick<Phone, "app" | "device">) {
  if (platform === "android") {
    await app.clearState();
    await openDevClient(device);
  } else {
    await device.clearKeychain();
    await app.restart();
  }
}
async function permissionChoice(
  { app, device, screen }: Pick<Phone, "app" | "device" | "screen">,
  email: string,
  profileId: string,
) {
  // iOS can retain notification authorization after reinstalling the same bundle.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (
    platform === "android" ||
    (await screen.getByRole("button", "Turn on", { exact: true }).isVisible())
  ) {
    await expect(
      screen.getByText("Turn on notifications to hear about mentions and replies."),
    ).toBeVisible();
    shot("permission-before");
    await screen.getByRole("button", "Not now", { exact: true }).tap();
    await expect(screen.getByRole("button", "Turn on", { exact: true })).not.toBeVisible();
    await screen.getByRole("button", "Account", { exact: true }).tap();
    await screen.getByRole("button", "Sign out", { exact: true }).tap();
    await expect(screen.getByLabel("Email")).toBeVisible();
    // The deliberate Not now choice survives sign-out; reset only this test's saved choice for permission proof.
    await resetPhone({ app, device });
    await expect(screen.getByLabel("Email")).toBeVisible();
    await signIn(screen, email);
    await screen.getByRole("button", "Turn on", { exact: true }).tap();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (await screen.getByRole("button", "Allow", { exact: true }).isVisible())
      await device.alert("accept");
    if (realDelivery)
      await expect.poll(() => expoDevices(profileId), { timeout: 90_000, interval: 2000 }).toBe(1);
    shot("permission-after");
  } else shot("permission-retained");
}

void test(
  "J8: permission, background and cold-start notification taps, suppression and sign-out",
  { timeout: 900_000, platforms: [platform] },
  async ({ app, device, screen }) => {
    const stamp = randomUUID().slice(0, 8);
    const emails = [
      `q9-j8-reader-${stamp}@example.net`,
      `q9-j8-writer-${stamp}@example.net`,
    ] as const;
    const sessions: PhoneSession[] = [];
    try {
      await resetPhone({ app, device });
      await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
      const reader = await createPhoneAccount(emails[0], "Nadia Reader", sessions);
      const writer = await createPhoneAccount(emails[1], "Bilal Writer", sessions);
      const title = `Push team ${stamp}`;
      const groupId = await writer.client.mutation(api.groups.create, {
        name: title,
        memberIds: [reader.id],
        inviteToken: randomUUID().replaceAll("-", ""),
      });
      await signIn(screen, emails[0]);
      await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
      await permissionChoice({ app, device, screen }, emails[0], reader.id);

      async function send(body: string) {
        return writer.client.mutation(api.messages.send, {
          groupId,
          body,
          clientKey: randomUUID(),
          attachments: [],
        });
      }
      async function pushFallback(body: string, sequence: number) {
        const payload = join(output, "fallback.apns");
        writeFileSync(
          payload,
          JSON.stringify({
            aps: { alert: { title: `Bilal in ${title}`, body }, sound: "default" },
            body: { url: `/g/${groupId}?m=${sequence}` },
          }),
        );
        simctl("push", udid, "ai.q9labs.chat", payload);
      }
      async function notify(body: string) {
        const sent = await send(body);
        if (!realDelivery) await pushFallback(body, sent.sequence);
      }
      async function tapNotification(body: string, phase: "background" | "cold" | "all") {
        if (platform === "android") {
          await expect
            .poll(() => adbShell("dumpsys notification --noredact").includes(body), {
              timeout: 90_000,
              interval: 1000,
            })
            .toBe(true);
          adbShell("cmd statusbar expand-notifications");
        }
        await expect(screen.getByText(body, { exact: false })).toBeVisible({ timeout: 60_000 });
        shot(`delivered-${phase}`);
        await screen.getByText(body, { exact: false }).tap();
        if (platform === "ios") {
          await device.openApp("ai.q9labs.chat");
          const welcome = screen.getByRole("button", "Continue", { exact: true });
          if (await welcome.isVisible()) await welcome.tap();
        }
        await expect(screen.getByLabel(`Bilal: ${body}`)).toBeVisible({ timeout: 60_000 });
        shot(`opened-${phase}`);
      }
      async function expectMode(mode: "all" | "muted") {
        await expect
          .poll(async () => {
            const detail = await reader.client.query(api.groups.get, { groupId });
            return detail?.status === "member" && detail.notify === mode;
          })
          .toBe(true);
      }
      async function groupControls() {
        await screen.getByRole("button", `Group info for ${title}`, { exact: true }).tap();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const mentions = screen.getByRole("button", "Mentions and replies", { exact: false });
        // Expo's native welcome sheet can intercept the first tap while exposing the app below it.
        if (
          platform === "ios" &&
          !(await mentions.isVisible()) &&
          (await screen.getByRole("button", `Group info for ${title}`, { exact: true }).isVisible())
        ) {
          await screen.getByRole("button", `Group info for ${title}`, { exact: true }).tap();
        }
        shot("group-settings-before");
        await mentions.tap();
        await screen.getByRole("radio", "All messages", { exact: false }).tap();
        await expectMode("all");
        shot("all-messages");
        await device.home();
        if (platform === "ios") await device.openApp("com.apple.springboard");
        await notify(`Every message ${stamp}`);
        await tapNotification(`Every message ${stamp}`, "all");
        await screen.getByRole("button", `Group info for ${title}`, { exact: true }).tap();
        await screen.getByRole("switch", "Mute this group", { exact: true }).tap();
        await expectMode("muted");
        await device.home();
        await send(`@Nadia muted ${stamp}`);
        await new Promise((resolve) => setTimeout(resolve, 8000));
        if (platform === "android")
          expect(
            adbShell("dumpsys notification --noredact").includes(`@Nadia muted ${stamp}`),
          ).toBe(false);
        await device.openLink(`q9chat://g/${groupId}`);
        await expect(screen.getByLabel(`Bilal: @Nadia muted ${stamp}`)).toBeVisible();
      }
      async function accountCleanup() {
        await device.openLink("q9chat:///");
        await screen.getByRole("button", "Account", { exact: true }).tap();
        if (realDelivery) {
          await fetch("http://localhost:8321/__fault", { method: "POST" });
          await screen.getByRole("button", "Sign out", { exact: true }).tap();
          await expect(screen.getByText("Couldn't sign out. Connect and try again.")).toBeVisible({
            timeout: 30_000,
          });
          await fetch("http://localhost:8321/__fault", { method: "DELETE" });
        }
        await screen.getByRole("button", "Sign out", { exact: true }).tap();
        await expect(screen.getByLabel("Email")).toBeVisible();
        await expect.poll(() => expoDevices(reader.id), { timeout: 30_000 }).toBe(0);
        shot("signed-out");
        await signIn(screen, emails[0]);
        await expect(screen.getByRole("button", "Account", { exact: true })).toBeVisible();
        if (realDelivery)
          await expect
            .poll(() => expoDevices(reader.id), { timeout: 90_000, interval: 2000 })
            .toBe(1);
        await screen.getByRole("button", "Account", { exact: true }).tap();
        await screen.getByRole("button", "Delete account", { exact: true }).tap();
        await screen.getByRole("button", "Delete account", { exact: true }).last().tap();
        await expect(screen.getByLabel("Email")).toBeVisible();
        await expect.poll(() => expoDevices(reader.id), { timeout: 30_000 }).toBe(0);
        const deleted = sessions.findIndex((session) => session.accessToken === reader.accessToken);
        if (deleted >= 0) sessions.splice(deleted, 1);
        shot("account-deleted");
      }
      async function coldStart() {
        await device.home();
        if (platform === "android") {
          const pid = Schema.decodeUnknownSync(Schema.String.pipe(Schema.pattern(/^[1-9]\d*$/u)))(
            adbShell("pidof ai.q9labs.chat").trim(),
          );
          adbShell(`run-as ai.q9labs.chat kill -9 ${pid}`);
          await expect.poll(() => adbShell("pidof ai.q9labs.chat || true").trim()).not.toBe(pid);
        } else {
          simctl("terminate", udid, "ai.q9labs.chat");
          // Select the OS before delivery so changing the observed app cannot dismiss its banner.
          await device.openApp("com.apple.springboard");
        }
      }
      await device.home();
      if (platform === "ios") await device.openApp("com.apple.springboard");
      await notify(`@Nadia background ${stamp}`);
      await tapNotification(`@Nadia background ${stamp}`, "background");
      await coldStart();
      await notify(`@Nadia cold ${stamp}`);
      await tapNotification(`@Nadia cold ${stamp}`, "cold");
      await notify(`@Nadia visible ${stamp}`);
      await expect(screen.getByLabel(`Bilal: @Nadia visible ${stamp}`)).toBeVisible();
      if (platform === "android") {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        expect(
          adbShell("dumpsys notification --noredact").includes(`@Nadia visible ${stamp}`),
        ).toBe(false);
      }
      await expect(screen.getByText(`Bilal in ${title}`, { exact: true })).not.toBeVisible();
      shot("visible-suppressed");
      await groupControls();
      await accountCleanup();
      process.stdout.write(
        `J8 ${platform}: ${realDelivery ? "real Expo/provider" : "simctl fallback; real APNs unproven"} delivery and tap proof complete\n`,
      );
    } catch (error) {
      shot("failure-before-cleanup");
      throw error;
    } finally {
      await Promise.all(sessions.map((session) => deletePhoneProfile(session)));
      await Promise.all(emails.map((email) => removeTestUser(email)));
    }
  },
);
