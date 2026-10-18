import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function scripts(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      return entry.isDirectory()
        ? scripts(path)
        : Promise.resolve(entry.name.endsWith(".js") ? [path] : []);
    }),
  );
  return nested.flat();
}
void test("built browser artifact excludes Worker credentials and server-only WorkOS calls", async () => {
  const files = await scripts(new URL("../dist/client/", import.meta.url));
  assert.ok(files.length > 0, "run the web build before this artifact check");
  for (const contents of await Promise.all(files.map((file) => readFile(file, "utf8")))) {
    for (const marker of [
      "WORKOS_API_KEY",
      "q9-auth-server-only-canary",
      "client_secret",
      "sessions/revoke",
    ]) {
      assert.equal(
        contents.includes(marker),
        false,
        `browser artifact contains server-only marker ${marker}`,
      );
    }
  }
});
