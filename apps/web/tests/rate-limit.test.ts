import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";

import { getPlatformProxy } from "wrangler";

void test("configured Cloudflare rate-limit bindings enforce budgets in local development", async (context) => {
  const proxy = await getPlatformProxy<{
    AUTH_START_EMAIL: RateLimit;
    AUTH_START_IP: RateLimit;
    AUTH_VERIFY_EMAIL: RateLimit;
    AUTH_VERIFY_IP: RateLimit;
  }>({ configPath: new URL("../wrangler.jsonc", import.meta.url).pathname, persist: false });
  try {
    for (const [name, binding, limit] of [
      ["AUTH_START_EMAIL", proxy.env.AUTH_START_EMAIL, 3],
      ["AUTH_START_IP", proxy.env.AUTH_START_IP, 20],
      ["AUTH_VERIFY_EMAIL", proxy.env.AUTH_VERIFY_EMAIL, 10],
      ["AUTH_VERIFY_IP", proxy.env.AUTH_VERIFY_IP, 60],
    ] as const) {
      // The local limiter resets every key at wall-clock minute boundaries.
      // Reserve a whole test timeout in one window before consuming its budget.
      const timeout = 10_000;
      const remaining = 60_000 - (Date.now() % 60_000);
      if (remaining < timeout + 1000) await setTimeout(remaining + 1000);
      await context.test(name, { timeout }, async () => {
        const key = crypto.randomUUID();
        for (let index = 0; index < limit; index++)
          assert.equal((await binding.limit({ key })).success, true);
        assert.equal((await binding.limit({ key })).success, false);
        assert.equal((await binding.limit({ key: `${key}-other` })).success, true);
      });
    }
  } finally {
    await proxy.dispose();
  }
});
