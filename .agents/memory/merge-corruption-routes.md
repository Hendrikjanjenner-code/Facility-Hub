---
name: Merge corruption in Express route files
description: Automated rebases can silently scramble route files without conflict markers.
---

Structural (per-symbol) merges during automated rebases can corrupt Express route files without leaving conflict markers: handlers fused, wrong zod bodies swapped in, duplicated declarations.

**Why:** low-confidence interstitial merges rewrite handler bodies; even "repair" commits on main have shipped still-broken files.

**How to apply:** after any rebase touching route files, run the full monorepo typecheck before trusting the result. Recover by restoring the newest git version that passes a real semantic typecheck, then diff intervening commits so real behavior (e.g. policy-enforcement branches) is not dropped with the corruption. Never hand-merge generated API clients — rerun codegen after the spec merges.
