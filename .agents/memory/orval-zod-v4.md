---
name: Orval emits Zod v4 API
description: Generated zod client must import zod/v4, not the zod v3 root
---
Generated Zod schemas from the OpenAPI codegen use Zod v4 API (`zod.int()`), while the workspace pins zod ^3.25 whose root export is the v3 API.

**Why:** Orval v8 assumes Zod v4; zod 3.25.x only exposes it via the `zod/v4` subpath, so importing from `'zod'` fails typecheck.

**How to apply:** Generated zod output must import from `zod/v4` (the codegen step handles this rewrite). Preserve that compatibility decision if codegen tooling or the zod version changes.
