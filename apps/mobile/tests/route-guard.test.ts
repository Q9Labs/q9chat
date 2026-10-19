import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

// The routes come from expo-router's own tree builder, and the guard is asked with its own matcher, over the
// real files in app/ and the names the layout lists.
const appDir = new URL("../app", import.meta.url).pathname;
const { getRoutes } = await import("expo-router/build/getRoutes");
const { isRouteGuarded } = await import("expo-router/build/layouts/GuardContext");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

const keys = files(appDir).map((file) => `./${relative(appDir, file)}`);
const context = Object.assign(() => ({ default: () => null }), {
  keys: () => keys,
  resolve: (key: string) => key,
  id: "app",
});
const root = getRoutes(context, { ignoreEntryPoints: true, platform: "ios" });
const routes = (root?.children ?? []).map((node) => node.route);

/** The screens the layout hides until the person is signed in. */
const layout = readFileSync(join(appDir, "_layout.tsx"), "utf8");
const block =
  /<Stack\.Protected guard=\{ready\}>([\s\S]*?)<\/Stack\.Protected>/u.exec(layout)?.[1] ?? "";
const listed = [...block.matchAll(/<Stack\.Screen name="([^"]+)"/gu)].map(
  (match) => match[1] ?? "",
);
const guards = new Map(listed.map((name) => [name, null]));

void test("the layout lists screens behind sign-in", () => {
  assert.notEqual(listed.length, 0);
});

void test("every screen the layout hides names a real route", () => {
  for (const name of listed)
    assert.equal(
      routes.some((route) => route === name || route === `${name}/index`),
      true,
      `${name} is not a route`,
    );
});

void test("every group screen, Account and New group are behind sign-in", () => {
  const behindSignIn = routes.filter(
    (route) => route.startsWith("g/") || route === "account" || route === "new-group",
  );
  assert.equal(behindSignIn.length >= 5, true);
  for (const route of behindSignIn)
    assert.equal(isRouteGuarded(route, guards), true, `${route} is open to a signed-out link`);
});

void test("the join link and the sign-in return stay open", () => {
  for (const route of ["join/[token]", "auth/callback"])
    assert.equal(isRouteGuarded(route, guards), false, `${route} must stay open`);
});

void test("the root layout starts no router until the stage has answered, so a cold link meets an open guard", () => {
  const holds = layout.indexOf("if (!answered) return null;");
  assert.notEqual(holds, -1);
  assert.equal(holds < layout.indexOf("<Stack "), true);
  assert.match(layout, /useStageAnswered\(stage\.kind\)/u);
});
