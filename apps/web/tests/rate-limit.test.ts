import assert from "node:assert/strict";
import test from "node:test";

import { getPlatformProxy } from "wrangler";

void test("configured Cloudflare rate-limit bindings enforce budgets in local development", async () => {
  const proxy = await getPlatformProxy<{
    AUTH_START_EMAIL: RateLimit;
    AUTH_START_IP: RateLimit;
    AUTH_VERIFY_EMAIL: RateLimit;
    AUTH_VERIFY_IP: RateLimit;
  }>({ configPath: new URL("../wrangler.jsonc", import.meta.url).pathname, persist: false });
  try {
    for (const [binding, limit] of [
      [proxy.env.AUTH_START_EMAIL, 3],
      [proxy.env.AUTH_START_IP, 20],
      [proxy.env.AUTH_VERIFY_EMAIL, 10],
      [proxy.env.AUTH_VERIFY_IP, 60],
    ] as const) {
      const key = crypto.randomUUID();
      for (let index = 0; index < limit; index++)
        assert.equal((await binding.limit({ key })).success, true);
      assert.equal((await binding.limit({ key })).success, false);
      assert.equal((await binding.limit({ key: `${key}-other` })).success, true);
    }
  } finally {
    await proxy.dispose();
  }
});
