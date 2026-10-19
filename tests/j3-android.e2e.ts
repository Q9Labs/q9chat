import { test } from "@e2e-dev/mobile";

import { runAndroidJourney } from "./support/android.js";
import { runJ3 } from "./support/j3-flow.js";

void test(
  "J3: open unread history and read live",
  { timeout: 600_000, platforms: ["android"] },
  (fixture) => runAndroidJourney(fixture, runJ3),
);
