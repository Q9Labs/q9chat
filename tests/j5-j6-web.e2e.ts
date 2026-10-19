import { surfaceOf, test } from "@e2e-dev/web";
import { api } from "@q9chat/convex";
import { expect } from "e2e";

import { browserEngine, devClient, signInDevAccount } from "./support/browser.js";
import { webOrigin } from "./support/origin.js";
import { removeTestUser } from "./support/workos.js";

test(
  "journeys 5 and 6: live message actions and distant quotes",
  { timeout: 360_000 },
  async ({ app }) => {
    const surface = surfaceOf(browserEngine);
    if (!surface) throw new Error("Missing live browser");
    await app.open("/");
    const page = surface.page();
    const engine = surface.context().browser();
    if (!engine) throw new Error("Missing browser engine");
    const peer = await engine.newContext();
    const stamp = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
    const emailA = `q9-j56-a-${stamp}@example.net`;
    const emailB = `q9-j56-b-${stamp}@example.net`;
    const a = await signInDevAccount(surface.context(), emailA, "Amira Actions");
    const b = await signInDevAccount(peer, emailB, "Bilal Actions");
    const shot = (name: string) => page.screenshot({ path: `artifacts/j5-j6/${name}.png` });
    let peerDeleted = false;
    try {
      const groupId = await a.client.mutation(api.groups.create, {
        name: "Message actions",
        memberIds: [b.id],
        inviteToken: crypto.randomUUID().replaceAll("-", ""),
      });
      const original = await b.client.mutation(api.messages.send, {
        groupId,
        clientKey: crypto.randomUUID(),
        body: "Original plan from Bilal",
        attachments: [],
      });
      // Put the original outside the bounded live window before opening the group.
      for (let index = 0; index < 310; index++) {
        // eslint-disable-next-line no-await-in-loop -- Serial fixture writes bound requests to the shared backend.
        await a.client.mutation(api.messages.send, {
          groupId,
          clientKey: crypto.randomUUID(),
          body: `History ${index}`,
          attachments: [],
        });
      }
      const recent = await b.client.mutation(api.messages.send, {
        groupId,
        clientKey: crypto.randomUUID(),
        body: "The latest plan",
        attachments: [],
      });
      const distant = await b.client.mutation(api.messages.send, {
        groupId,
        clientKey: crypto.randomUUID(),
        body: "Reference to the original",
        replyToId: original.messageId,
        attachments: [],
      });
      await a.client.mutation(api.readStates.markRead, { groupId, sequence: distant.sequence });
      await b.client.mutation(api.readStates.markRead, { groupId, sequence: distant.sequence });
      await page.goto(`${webOrigin}/?group=${groupId}`);
      const peerPage = await peer.newPage();
      await peerPage.goto(`${webOrigin}/?group=${groupId}`);
      const field = page.getByRole("textbox", { name: "Message", exact: true });
      await field.waitFor();
      await page
        .locator(`#m-${distant.messageId}`)
        .getByRole("button", { name: /Quoted message/ })
        .click();
      await page.locator(`#m-${original.messageId}`).waitFor({ state: "visible" });
      await expect
        .poll(() =>
          page.locator(`#m-${original.messageId}`).evaluate((node) => {
            const box = node.getBoundingClientRect();
            return box.top > 0 && box.bottom < innerHeight;
          }),
        )
        .toBe(true);
      await shot("distant-quote");
      await b.client.mutation(api.messages.send, {
        groupId,
        clientKey: crypto.randomUUID(),
        body: "New arrival while reading a quote",
        attachments: [],
      });
      await page
        .locator(".txt", { hasText: "New arrival while reading a quote" })
        .waitFor({ state: "visible" });
      await page
        .locator(`#m-${distant.messageId}`)
        .getByRole("button", { name: /Quoted message/ })
        .click();
      await page.locator(`#m-${original.messageId}`).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Jump to latest", exact: true }).click();
      await page.locator(`#m-${recent.messageId}`).waitFor({ state: "visible" });
      const recentRow = page.locator(`#m-${recent.messageId}`);
      await recentRow.hover();
      await recentRow.getByRole("button", { name: "Reply", exact: true }).click();
      await page.getByText("Replying to", { exact: false }).waitFor();
      await shot("reply-composer");
      await field.fill("My quoted reply");
      await field.press("Enter");
      const mine = page
        .locator(".msg")
        .filter({ has: page.locator(".txt", { hasText: "My quoted reply" }) });
      const theirs = peerPage
        .locator(".msg")
        .filter({ has: peerPage.locator(".txt", { hasText: "My quoted reply" }) });
      await theirs.waitFor();
      await theirs.getByRole("button", { name: /Quoted message from You/ }).waitFor();
      await mine.getByRole("button", { name: /Quoted message from Bilal/ }).waitFor();
      await field.press("ArrowUp");
      await expect.poll(() => field.inputValue()).toBe("My quoted reply");
      await field.fill("My edited reply");
      await field.press("Enter");
      await peerPage
        .locator(".txt", { hasText: "My edited reply" })
        .getByText("edited", { exact: true })
        .waitFor();
      const edited = page
        .locator(".msg")
        .filter({ has: page.locator(".txt", { hasText: "My edited reply" }) });
      await edited.hover();
      await edited.getByRole("button", { name: "More actions", exact: true }).click();
      await shot("mine-more");
      await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
      await field.fill("My final reply");
      await field.press("Enter");
      await peerPage.locator(".txt", { hasText: "My final reply" }).waitFor();
      await recentRow.hover();
      await recentRow.getByRole("button", { name: "React with ❤️", exact: true }).click();
      await peerPage.locator(`#m-${recent.messageId} .chip`).waitFor();
      const pill = recentRow.locator(".chip");
      await pill.hover();
      await expect.poll(() => pill.getAttribute("aria-label")).toContain("You");
      await shot("reaction");
      await pill.click();
      await expect.poll(() => peerPage.locator(`#m-${recent.messageId} .chip`).count()).toBe(0);
      await recentRow.hover();
      await recentRow.getByRole("button", { name: "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Report", exact: true }).click();
      await page.getByText("Spam", { exact: true }).click();
      await shot("report");
      await page.getByRole("button", { name: "Send report", exact: true }).click();
      await page
        .getByText("Report sent. Thank you for letting us know.", { exact: true })
        .waitFor();
      await peerPage.locator(`#m-${recent.messageId} .txt`).waitFor();
      const final = page
        .locator(".msg")
        .filter({ has: page.locator(".txt", { hasText: "My final reply" }) });
      await final.hover();
      await final.getByRole("button", { name: "More actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
      await shot("delete-confirm");
      await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
      await peerPage.getByText("Message deleted", { exact: true }).waitFor();
      await page.getByText("You deleted this message", { exact: true }).waitFor();
      await shot("deleted");
      await peerPage.evaluate(async (owner) => {
        sessionStorage.setItem(`q9chat:text:${owner}:draft-group:draft`, "Private draft");
        localStorage.setItem(`q9chat:text:${owner}:draft-group:pending:retry`, "Private retry");
        const request = indexedDB.open("q9chat-media-v1", 1);
        await new Promise<void>((resolve, reject) => {
          request.onupgradeneeded = () => request.result.createObjectStore("pending");
          request.addEventListener("error", () => reject(request.error), { once: true });
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction("pending", "readwrite");
            tx.objectStore("pending").put(
              new Blob(["Private attachment"]),
              `${owner}:draft-group:retry`,
            );
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.addEventListener(
              "abort",
              () => {
                db.close();
                reject(tx.error);
              },
              { once: true },
            );
          };
        });
      }, b.id);
      await peerPage.getByRole("button", { name: "Account", exact: true }).click();
      await peerPage.getByRole("button", { name: "Delete account", exact: true }).click();
      await peerPage.getByRole("dialog", { name: "Delete your account?" }).waitFor();
      await peerPage.screenshot({ path: "artifacts/j5-j6/delete-account.png" });
      await peerPage.getByRole("button", { name: "Delete account", exact: true }).click();
      await peerPage.getByRole("button", { name: "Email me a code", exact: true }).waitFor();
      peerDeleted = true;
      const retained = await peerPage.evaluate(async (owner) => {
        const text = [localStorage, sessionStorage].flatMap((storage) =>
          Object.keys(storage).filter((key) => key.startsWith(`q9chat:text:${owner}:`)),
        );
        const request = indexedDB.open("q9chat-media-v1", 1);
        const media = await new Promise<IDBValidKey[]>((resolve, reject) => {
          request.addEventListener("error", () => reject(request.error), { once: true });
          request.onsuccess = () => {
            const db = request.result;
            const keys = db.transaction("pending").objectStore("pending").getAllKeys();
            keys.onsuccess = () => {
              db.close();
              resolve(keys.result);
            };
            keys.addEventListener(
              "error",
              () => {
                db.close();
                reject(keys.error);
              },
              { once: true },
            );
          };
        });
        return [
          ...text,
          ...media.filter((key) => typeof key === "string" && key.includes(`${owner}:`)),
        ];
      }, b.id);
      expect(retained).toEqual([]);
      const deletedAuthor = recentRow
        .locator("..")
        .getByRole("button", { name: "Deleted account", exact: true });
      await deletedAuthor.waitFor();
      await deletedAuthor.scrollIntoViewIfNeeded();
      await shot("deleted-account");
      process.stdout.write(
        "PASS: distant quote, latest, reply, arrow/menu edit, live react/unreact, private report, live deletion, account deletion and sign-out.\n",
      );
    } catch (cause) {
      await shot("failure");
      throw cause;
    } finally {
      await Promise.allSettled([
        devClient(surface.context(), a.client).then((client) =>
          client.mutation(api.profiles.deleteAccount, {}),
        ),
        peerDeleted
          ? Promise.resolve()
          : devClient(peer, b.client).then((client) =>
              client.mutation(api.profiles.deleteAccount, {}),
            ),
      ]);
      await peer.close();
      await Promise.all([removeTestUser(emailA), removeTestUser(emailB)]);
    }
  },
);
