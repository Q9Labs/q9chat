import { mobile } from "@e2e-dev/mobile";
import type { E2EConfig } from "e2e";

// Run with `e2e run --config e2e.phone.config.ts` on a Mac with the dev client installed on a simulator.
// J1_PHONE_UDID pins the simulator, J1_PHONE_METRO is the dev server the dev client loads its JavaScript from.
const udid = process.env["J1_PHONE_UDID"];
const metro = process.env["J1_PHONE_METRO"] ?? "http://localhost:8081";

export default {
  tests: ["tests/*-phone.e2e.ts"],
  assertionTimeout: 20_000,
  // One simulator or emulator serves the whole run, so two tests at once would restart each other's app.
  workers: 1,
  targets: [
    {
      name: "ios",
      engine: mobile({ platform: "ios", settle: false, ...(udid ? { device: udid } : {}) }),
      app: {
        bundleId: "ai.q9labs.chat",
        launchArguments: [
          "--initialUrl",
          metro,
          "-EXDevMenuShowsAtLaunch",
          "NO",
          "-EXDevMenuIsOnboardingFinished",
          "YES",
          "-EXDevMenuShowFloatingActionButton",
          "NO",
        ],
      },
    },
  ],
} satisfies E2EConfig;
