import type { E2EConfig } from "e2e";

import { browserEngine } from "./tests/support/browser.js";
import { webOrigin } from "./tests/support/origin.js";

export default {
  tests: ["tests/*-web.e2e.ts"],
  assertionTimeout: 20_000,
  targets: [{ engine: browserEngine, app: { url: webOrigin } }],
} satisfies E2EConfig;
