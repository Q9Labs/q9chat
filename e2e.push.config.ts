import { mobile } from "@e2e-dev/mobile";
import type { E2EConfig } from "e2e";

const platform = process.env["J8_PLATFORM"] === "android" ? "android" : "ios";
const device = platform === "android" ? "emulator-5590" : "DC55017E-BBF2-42B4-A00C-6B08864EFF51";
export default {
  tests: ["tests/j8-push.e2e.ts"],
  assertionTimeout: 30_000,
  workers: 1,
  targets: [
    {
      name: platform,
      engine: mobile({ platform, device, session: `q9-j8-push-${platform}`, transition: 1000 }),
      app: {
        bundleId: "ai.q9labs.chat",
        launchArguments:
          platform === "ios"
            ? [
                "--initialUrl",
                "http://localhost:8197",
                "-EXDevMenuShowsAtLaunch",
                "NO",
                "-EXDevMenuIsOnboardingFinished",
                "YES",
                "-EXDevMenuShowFloatingActionButton",
                "NO",
              ]
            : [],
      },
    },
  ],
} satisfies E2EConfig;
