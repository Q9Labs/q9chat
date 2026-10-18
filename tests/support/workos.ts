import { api } from "@q9chat/convex";
import { ConvexHttpClient } from "convex/browser";
import { Schema } from "effect";

const key = process.env["WORKOS_API_KEY"];
if (!key || !key.startsWith("sk_test_")) throw new Error("A staging WorkOS key is required");
const headers = { Authorization: `Bearer ${key}` };
const events = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      data: Schema.Struct({ id: Schema.String, email: Schema.String }),
    }),
  ),
});

const retrievedChallenges = new Set<string>();
const cookies = new Map<string, string>();

export async function magicCode(email: string) {
  // Read the challenge created by our UI/public API, never replace it with another challenge.
  const params = new URLSearchParams({
    events: "magic_auth.created",
    limit: "100",
    range_start: new Date(Date.now() - 60_000).toISOString(),
  });
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`https://api.workos.com/events?${params}`, { headers });
    if (!response.ok) throw new Error(`WorkOS events returned ${response.status}`);
    const id = Schema.decodeUnknownSync(events)(await response.json()).data.find(
      (event) => event.data.email === email && !retrievedChallenges.has(event.data.id),
    )?.data.id;
    if (id) {
      retrievedChallenges.add(id);
      const challenge = await fetch(`https://api.workos.com/user_management/magic_auth/${id}`, {
        headers,
      });
      if (!challenge.ok) throw new Error(`WorkOS challenge returned ${challenge.status}`);
      return Schema.decodeUnknownSync(Schema.Struct({ code: Schema.String }))(
        await challenge.json(),
      ).code;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("No Magic Auth event for the fresh test user");
}

async function authPost(path: string, body: object) {
  const response = await fetch(`http://localhost:3000/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:3000",
      Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    },
    body: JSON.stringify(body),
  });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0] ?? "";
    const index = pair.indexOf("=");
    if (index >= 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response;
}

const phoneSession = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  user: Schema.Struct({ id: Schema.String }),
});

export async function removeTestUser(email: string) {
  const response = await fetch(
    `https://api.workos.com/user_management/users?email=${encodeURIComponent(email)}`,
    { headers },
  );
  if (!response.ok) throw new Error(`WorkOS user lookup returned ${response.status}`);
  const Users = Schema.Struct({ data: Schema.Array(Schema.Struct({ id: Schema.String })) });
  const users = Schema.decodeUnknownSync(Users)(await response.json());
  for (const user of users.data) {
    const deleted = await fetch(`https://api.workos.com/user_management/users/${user.id}`, {
      method: "DELETE",
      headers,
    });
    if (!deleted.ok && deleted.status !== 404)
      throw new Error(`WorkOS test-user cleanup returned ${deleted.status}`);
  }
  const remaining = await fetch(
    `https://api.workos.com/user_management/users?email=${encodeURIComponent(email)}`,
    { headers },
  );
  if (!remaining.ok) throw new Error(`WorkOS cleanup verification returned ${remaining.status}`);
  if (Schema.decodeUnknownSync(Users)(await remaining.json()).data.length !== 0)
    throw new Error("Fresh WorkOS test user still exists after cleanup");
}

export type PhoneSession = Schema.Schema.Type<typeof phoneSession>;

export async function signInPhone(email: string): Promise<PhoneSession> {
  await authPost("email/start", { email });
  return Schema.decodeUnknownSync(phoneSession)(
    await (
      await authPost("email/verify", {
        email,
        code: await magicCode(email),
        client: "phone",
      })
    ).json(),
  );
}

export async function deletePhoneProfile(session: PhoneSession) {
  const client = new ConvexHttpClient("https://quixotic-crab-23.convex.cloud");
  client.setAuth(session.accessToken);
  if ((await client.query(api.profiles.me, {}))?.status === "ready")
    await client.mutation(api.profiles.deleteAccount, {});
  await authPost("sign-out", { refreshToken: session.refreshToken });
}
