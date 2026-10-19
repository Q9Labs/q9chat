import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { adb } from "./android.js";

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : entry.isFile() ? [path] : [];
  });
}

/** Inspect app-owned bytes through the native sandbox, not a product-side test flag. */
export function phoneMediaFiles(platform: "ios" | "android", profile: string, group: string) {
  const files =
    platform === "android"
      ? adb("shell", "run-as", "ai.q9labs.chat", "find", "cache", "-type", "f")
          .toString()
          .trim()
          .split("\n")
      : filesBelow(
          join(
            execFileSync(
              "xcrun",
              [
                "simctl",
                "get_app_container",
                process.env["J1_IOS_UDID"] ?? "DC55017E-BBF2-42B4-A00C-6B08864EFF51",
                "ai.q9labs.chat",
                "data",
              ],
              { encoding: "utf8" },
            ).trim(),
            "Library",
            "Caches",
          ),
        );
  const cached = files.filter((path) => path.includes(`/q9-media-${profile}-${group}-`)).toSorted();
  appendFileSync(
    join(tmpdir(), `q9-phone-media-erasure-${platform}.jsonl`),
    `${JSON.stringify({ profile, group, cached })}\n`,
  );
  return cached;
}
