import { test } from "@e2e-dev/mobile";

import { openDevClient, runAndroidJourney } from "./support/android.js";
import { runPhoneGroups } from "./support/phone-groups-flow.js";

void test(
  "Phone groups: search, mute, leave and remove",
  { timeout: 900_000, platforms: ["android"] },
  (fixture) =>
    runAndroidJourney(fixture, (input) =>
      runPhoneGroups({ ...input, restart: () => openDevClient(fixture.device) }),
    ),
);
