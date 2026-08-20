---
name: Orval emits Zod v4 API
description: Generated zod client must import zod/v4, not the zod v3 root
---
Generated Zod schemas from the OpenAPI codegen use Zod v4 API (`zod.int()`), while the workspace pins zod ^3.25 whose root export is the v3 API.

**Why:** Orval v8 assumes Zod v4; zod 3.25.x only exposes it via the `zod/v4` subpath, so importing from `'zod'` fails typecheck.

**How to apply:** Generated zod output must import from `zod/v4` (the codegen step handles this rewrite). Preserve that compatibility decision if codegen tooling or the zod version changes.

**Also:** orval `workspace` mode rewrites `lib/api-zod/src/index.ts` on every codegen, re-adding exports for each output target. A `schemas: { path: "generated/types", type: "typescript" }` output collides (TS2308) with the zod exports and can't be fixed by editing index.ts — remove the schemas output from orval.config.ts instead (consumers use z.infer).
