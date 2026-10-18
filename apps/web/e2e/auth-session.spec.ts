import { expect, test } from "@playwright/test";

const session = (id: string) => ({
  accessToken: `access-${id}`,
  expiresAt: Date.now() + 300_000,
  method: "email",
  user: { id, email: "browser@example.net", firstName: null, lastName: null },
});
const cookie = (value: string, maxAge = 3600) =>
  `q9_session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth; Max-Age=${maxAge}`;

test("browser provider persists an httpOnly cookie across reload and propagates logout/account changes", async ({
  context,
  page,
}) => {
  let identity = "first";
  const cookieRequests: boolean[] = [];
  await context.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const hasCookie =
      (await route.request().allHeaders())["cookie"]?.includes("q9_session=") ?? false;
    if (path.endsWith("sign-out")) {
      await route.fulfill({ json: { ok: true }, headers: { "Set-Cookie": cookie("", 0) } });
    } else if (path.endsWith("email/verify")) {
      await route.fulfill({ json: session(identity), headers: { "Set-Cookie": cookie(identity) } });
    } else {
      cookieRequests.push(hasCookie);
      await route.fulfill({
        status: hasCookie ? 200 : 401,
        json: hasCookie ? session(identity) : {},
      });
    }
  });
  await page.goto("/tests/session-harness.html");
  await expect(page.getByTestId("session")).toHaveText("unauthenticated:none");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByTestId("session")).toHaveText("authenticated:first");
  expect(await page.evaluate(() => document.cookie)).toBe("");
  const stored = (await context.cookies()).find((entry) => entry.name === "q9_session");
  expect(stored).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/api/auth",
  });
  await page.reload();
  await expect(page.getByTestId("session")).toHaveText("authenticated:first");
  expect(cookieRequests.at(-1)).toBe(true);
  const second = await context.newPage();
  await second.goto("/tests/session-harness.html");
  await expect(second.getByTestId("session")).toHaveText("authenticated:first");
  identity = "second";
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(second.getByTestId("session")).toHaveText("authenticated:second");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(second.getByTestId("session")).toHaveText("unauthenticated:none");
  await page.reload();
  await expect(page.getByTestId("session")).toHaveText("unauthenticated:none");
  expect((await context.cookies()).some((entry) => entry.name === "q9_session")).toBe(false);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("reload cannot lose sign-out while another tab has verification pending", async ({
  context,
  page,
}) => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let loggedOut = false;
  await context.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("email/verify")) {
      started.resolve();
      await release.promise;
      await route.fulfill({ status: 401, json: { error: "invalid_transaction" } });
    } else if (path.endsWith("sign-out")) {
      loggedOut = true;
      await route.continue();
    } else if (path.endsWith("token")) {
      await route.fulfill({
        status: loggedOut ? 401 : 200,
        json: loggedOut ? {} : session("before"),
      });
    } else await route.continue();
  });
  const second = await context.newPage();
  try {
    await page.goto("/tests/session-harness.html");
    await second.goto("/tests/session-harness.html");
    await expect(second.getByTestId("session")).toHaveText("authenticated:before");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await started.promise;
    await second.getByRole("button", { name: "Sign out", exact: true }).click();
    await second.reload();
    await expect.poll(() => loggedOut).toBe(true);
    await expect(second.getByTestId("session")).toHaveText("unauthenticated:none");
    release.resolve();
    await expect(page.getByTestId("session")).toHaveText("unauthenticated:none");
  } finally {
    release.resolve();
  }
});

test("real Worker rejects a late OAuth callback after sign-out consumes the transaction cookie", async ({
  context,
  page,
}) => {
  const start = await context.request.get("/api/auth/oauth/google?client=web", { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  const authorize = new URL(start.headers()["location"] ?? "");
  const state = authorize.searchParams.get("state");
  expect((await context.cookies()).some((value) => value.name === "q9_oauth")).toBe(true);
  const logout = await context.request.post("/api/auth/sign-out", { data: {} });
  expect(logout.ok()).toBe(true);
  expect((await context.cookies()).some((value) => value.name === "q9_oauth")).toBe(false);
  const callback = await context.request.get(`/api/auth/callback?code=late-code&state=${state}`, {
    maxRedirects: 0,
  });
  expect(callback.status()).toBe(302);
  expect(callback.headers()["location"]).toBe(
    new URL("/auth/error?reason=invalid_state", callback.url()).href,
  );
  await page.goto("/auth/error?reason=invalid_state");
  await expect(page).toHaveURL(new URL("/?authError=true", callback.url()).href);
  await expect(page.locator(".toast")).toHaveText("Sign-in wasn't completed. Try again.");
  expect((await context.cookies()).some((value) => value.name === "q9_session")).toBe(false);
});

test("OAuth navigation bootstraps a changed user and announces it to the existing tab", async ({
  context,
  page,
}) => {
  let identity = "before-oauth";
  await context.route("**/api/auth/token", (route) => route.fulfill({ json: session(identity) }));
  await page.goto("/tests/session-harness.html");
  await expect(page.getByTestId("session")).toHaveText("authenticated:before-oauth");
  const second = await context.newPage();
  await second.goto("/tests/session-harness.html");
  await expect(second.getByTestId("session")).toHaveText("authenticated:before-oauth");
  identity = "after-oauth";
  // A successful OAuth callback navigates into a fresh provider instance.
  await second.reload();
  await expect(second.getByTestId("session")).toHaveText("authenticated:after-oauth");
  await expect(page.getByTestId("session")).toHaveText("authenticated:after-oauth");
});

test("an old terminal refresh failure cannot delete a newer sign-in cookie in another tab", async ({
  context,
  page,
}) => {
  // Execute the actual public token route; substitute only the outside WorkOS HTTP response.
  const { call, outside, seal } = await import("../tests/auth-fixture.ts");
  const old = await seal({
    refreshToken: "old-refresh",
    method: "email",
    sessionId: "old-session",
  });
  let failed: Response | undefined;
  await outside(
    async () => {
      failed = await call("token", {}, "", `q9_session=${old}`);
    },
    async (url) => {
      expect(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).toBe(
        "https://api.workos.com/user_management/authenticate",
      );
      return Response.json({ code: "session_revoked" }, { status: 400 });
    },
  );
  if (!failed) throw new Error("Missing public token response");
  const failure = {
    status: failed.status,
    headers: Object.fromEntries(failed.headers),
    body: await failed.text(),
  };
  expect(failure.status).toBe(401);
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let held = false;
  await context.addCookies([
    {
      name: "q9_session",
      value: old,
      domain: "127.0.0.1",
      path: "/api/auth",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
  await context.route("**/api/auth/**", async (route) => {
    if (new URL(route.request().url()).pathname.endsWith("email/verify")) {
      await route.fulfill({
        json: session("new-account"),
        headers: { "Set-Cookie": cookie("new-account") },
      });
      return;
    }
    const incoming = (await route.request().allHeaders())["cookie"] ?? "";
    if (!held && incoming.includes(old)) {
      held = true;
      started.resolve();
      await release.promise;
      await route.fulfill(failure);
    } else {
      const newer = incoming.includes("q9_session=new-account");
      await route.fulfill({
        status: newer || incoming.includes(old) ? 200 : 401,
        json: session(newer ? "new-account" : "old-account"),
      });
    }
  });
  try {
    await page.goto("/tests/session-harness.html");
    await started.promise;
    const second = await context.newPage();
    await second.goto("/tests/session-harness.html");
    await expect(second.getByTestId("session")).toHaveText("authenticated:old-account");
    await second.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(second.getByTestId("session")).toHaveText("authenticated:new-account");
    release.resolve();
    await expect(page.getByTestId("session")).toHaveText("authenticated:new-account");
    expect((await context.cookies()).find((entry) => entry.name === "q9_session")?.value).toBe(
      "new-account",
    );
    await second.reload();
    await expect(second.getByTestId("session")).toHaveText("authenticated:new-account");
  } finally {
    release.resolve();
  }
});

test("cancelled email transaction shows request-new-code copy rather than retrying a wrong code", async ({
  context,
  page,
}) => {
  await context.route("**/api/auth/token", (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto("/tests/session-harness.html");
  await expect(page.getByTestId("session")).toHaveText("unauthenticated:none");
  // No transaction cookie: both attempts go through the real Worker verifier.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText("That code has expired. Send a new one.");
  }
});
