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

test("browser sign-out cannot finish before a delayed verification writes its cookie", async ({
  context,
  page,
}) => {
  const started = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let signedOut = false;
  await context.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("email/verify")) {
      started.resolve();
      await release.promise;
      await route.fulfill({
        json: session("delayed"),
        headers: { "Set-Cookie": cookie("delayed") },
      });
    } else if (path.endsWith("sign-out")) {
      signedOut = true;
      await route.fulfill({ json: { ok: true }, headers: { "Set-Cookie": cookie("", 0) } });
    } else await route.fulfill({ status: 401, json: {} });
  });
  try {
    await page.goto("/tests/session-harness.html");
    await expect(page.getByTestId("session")).toHaveText("unauthenticated:none");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await started.promise;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    expect(signedOut).toBe(false);
    release.resolve();
    await expect.poll(() => signedOut).toBe(true);
    await expect(page.getByTestId("session")).toHaveText("unauthenticated:none");
    await expect
      .poll(async () => (await context.cookies()).some((entry) => entry.name === "q9_session"))
      .toBe(false);
  } finally {
    release.resolve();
  }
});
