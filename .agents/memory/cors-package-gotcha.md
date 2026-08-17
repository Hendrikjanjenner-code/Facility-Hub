---
name: cors package string origin gotcha
description: Express `cors` sends a fixed string origin header unconditionally; use array/function form for allowlists.
---
Passing a string to `cors({ origin: "https://x" })` sets `Access-Control-Allow-Origin: https://x` on **every** response, regardless of the request's Origin. Use a single-element array (or callback) so the header is only echoed for matching origins.

**Why:** a security review test caught the header leaking to unapproved origins.

**How to apply:** validate `ALLOWED_ORIGIN` at startup (reject `*` and non-http(s) URLs — see `api-server/src/lib/corsOrigin.ts` pattern) and pass an array to `cors`.
