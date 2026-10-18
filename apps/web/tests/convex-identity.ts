import assert from "node:assert/strict";

// Convex authenticates the Bearer credential before resolving a function path.
// No identity-reading function exists yet. This checks JWT acceptance, not the
// value of ctx.auth inside a deployed function, and installs no test code.
const request = (token: string) =>
  fetch("https://quixotic-crab-23.convex.cloud/api/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: "authProof:identity", args: {}, format: "json" }),
  });
export async function verifyConvexToken(accessToken: string) {
  const invalid = await request("intentionally-invalid-token");
  assert.equal(invalid.status, 401, "Convex must evaluate the Bearer credential");
  const accepted = await request(accessToken);
  assert.equal(accepted.status, 200, "Convex must accept the real WorkOS JWT");
  assert.match(await accepted.text(), /Could not find public function/);
}
