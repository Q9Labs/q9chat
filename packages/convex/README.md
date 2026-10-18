# `@q9chat/convex`

The workspace-only package that exposes the generated Convex API and types to
the apps. The backend functions live in the top-level `convex/` directory.

```ts
import { api } from "@q9chat/convex";
import type { Doc, Id } from "@q9chat/convex";
```

The generated `convex/_generated` directory is committed. The gate regenerates
it offline and checks for drift; the package build consumes those committed types.
