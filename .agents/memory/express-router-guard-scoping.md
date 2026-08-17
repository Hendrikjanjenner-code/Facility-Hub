---
name: Express router guard scoping
description: Bare router.use(requireRole) in one route module leaks into later-mounted routers.
---
Rule: never call `router.use(requireAuth, requireRole(...))` without a path prefix in a route module that shares an app mount with other routers registered afterwards.

**Why:** All route modules are mounted on the same `/api` router; Express middleware registered without a path runs for every request that reaches that router afterwards. A bare role guard in one module silently 403'd every later-registered module for other roles.

**How to apply:** Scope guards to the module's own path prefixes (e.g. `router.use("/mjop", ...)`) or attach them per-route. When a new endpoint mysteriously 403s for a role that should have access, check earlier-registered modules for bare `router.use` guards.
