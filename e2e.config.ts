import type { E2EConfig } from "e2e";

import { browserEngine } from "./tests/support/browser.js";

export default {
  tests: ["tests/*.e2e.ts"],
  assertionTimeout: 20_000,
  targets: [{ engine: browserEngine, app: { url: "http://localhost:3000" } }],
} satisfies E2EConfig;
