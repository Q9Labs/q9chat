import { defineGate, lanes } from "@q9labsai/gates";

export default defineGate({
  workspaceRoots: ["apps", "packages", "convex"],
  classifiers: {
    source: [".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"],
    docs: ["scratchpad/", "*.md", "*.mdx", "*.txt"],
    dependency: ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"],
    gateDefinition: ["gate.config.ts", "lefthook.yml", "turbo.json", ".github/workflows/"],
    contract: ["convex/schema.ts"],
  },
  concurrency: "50%",
  lanes: [
    lanes.typecheck(),
    lanes.lint(),
    lanes.format(),
    lanes.test(),
    lanes.build(),
    lanes.fallow({ baselineDir: "gates/baselines/fallow" }),
    lanes.semgrep({
      packs: ["@q9labsai/config-semgrep/type-safety", "@q9labsai/config-semgrep/shape-heuristics"],
    }),
    lanes.depcruise(),
    lanes.osv(),
    // T3 keeps every agent turn as a checkpoint under refs/t3/. Those are not
    // project history, so a dropped draft there must not block every commit.
    lanes.gitleaks({ mode: "git", logOpts: "--exclude=refs/t3/* --all" }),
    lanes.cspell(),
    lanes.syncpack(),
    lanes.testPresence({ sourceRoots: ["apps/*/src", "packages/*/src"] }),
    lanes.reactDoctor(),
    lanes.shellcheck(),
    lanes.actionlint(),
    lanes.contractDrift({
      id: "convex-codegen-drift",
      title: "Convex codegen drift",
      generate: "convex codegen --system-udfs --typecheck disable",
      paths: ["convex/_generated"],
    }),
    // Budget covers the client deploy artifact (JS + CSS); fonts and the SSR
    // worker ship separately and are not part of the interactive payload.
    lanes.bundleSize({ budgets: { "apps/web/dist/client/assets/*.{js,css}": "325 kB" } }),
    lanes.versionDrift(),
    lanes.hygiene(),
  ],
});
