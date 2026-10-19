import { mobile } from "@e2e-dev/mobile";
import type { E2EConfig } from "e2e";

// Run with `e2e run --config e2e.android.config.ts` on a Mac with the dev client installed on an emulator.
// J1_ANDROID_SERIAL pins the emulator (default emulator-5590). The dev server is opened by the test with a
// deep link, because expo-dev-launcher on Android does not read --initialUrl.
const serial = process.env["J1_ANDROID_SERIAL"] ?? "emulator-5590";

export default {
  tests: ["tests/j1-android.e2e.ts", "tests/j2-android.e2e.ts", "tests/j3-android.e2e.ts"],
  assertionTimeout: 20_000,
  // One simulator or emulator serves the whole run, so two tests at once would restart each other's app.
  workers: 1,
  targets: [
    {
      name: "android",
      engine: mobile({ platform: "android", device: serial }),
      app: { bundleId: "ai.q9labs.chat" },
    },
  ],
} satisfies E2EConfig;
