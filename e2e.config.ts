import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";

export default {
  tests: ["tests/*.e2e.ts"],
  assertionTimeout: 20_000,
  targets: [{ engine: web(), app: { url: "http://localhost:3000" } }],
} satisfies E2EConfig;
