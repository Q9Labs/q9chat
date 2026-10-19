import { test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { runJ4bPhone } from "./support/j4b-phone-flow.js";

void test(
  "J4b: photo, file, peer voice playback and recorder cancel",
  { timeout: 600_000, platforms: ["ios"] },
  async ({ app, screen }) => {
    await app.restart();
    await expect(screen.getByLabel("Email")).toBeVisible({ timeout: 120_000 });
    await runJ4bPhone({
      screen,
      voice: "peer",
      enter: async (field, value) => {
        await field.pressSequentially(value, { delay: 80 });
      },
      submitEmail: async () => {
        await screen.getByLabel("Email").press("Enter");
        await expect(screen.getByTestId("Go")).not.toBeVisible();
      },
      shot: async (name) => {
        await app.screenshot(name);
      },
      openFile: async () => {
        await expect(screen.getByRole("listitem", "Copy", { exact: true })).toBeVisible();
        await app.screenshot("j4b-file-open");
        await screen.getByRole("listitem", "Copy", { exact: true }).tap();
      },
      pickPhoto: async () => {
        await screen
          .getByRole("image", /^Photo, /)
          .first()
          .tap();
      },
      pickFile: async () => {
        await screen.getByLabel("Browse", { exact: true }).doubleTap();
        await screen.getByText("On My iPhone", { exact: true }).tap();
        await screen.getByRole("listitem", /^Downloads, /u).tap();
        await screen.getByRole("listitem", /^q9-attachment/u).tap();
      },
    });
  },
);
