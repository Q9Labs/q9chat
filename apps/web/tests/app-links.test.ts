import assert from "node:assert/strict";
import { test } from "node:test";

import { appleAppSiteAssociation, assetLinks, wellKnownResponse } from "../src/lib/app-links.ts";

void test("iOS app links name the Q9 Chat app for invites and groups", () => {
  const detail = appleAppSiteAssociation.applinks.details[0];
  assert.deepEqual(detail.appIDs, ["5K9635LZ6F.ai.q9labs.chat"]);
  assert.deepEqual(detail.components, [{ "/": "/join/*" }, { "/": "/g/*" }]);
});

void test("Android asset links name the Play signing certificate", () => {
  const link = assetLinks[0];
  assert.equal(link.target.package_name, "ai.q9labs.chat");
  assert.match(link.target.sha256_cert_fingerprints[0], /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/u);
});

void test("well-known files are served as JSON", async () => {
  const response = wellKnownResponse(appleAppSiteAssociation);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json/u);
  assert.deepEqual(await response.json(), appleAppSiteAssociation);
});
