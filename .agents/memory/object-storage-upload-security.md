---
name: Object storage upload security
description: Why file uploads go through the API instead of Replit presigned PUT URLs
---

Replit App Storage presigned URLs (signed via the sidecar at `127.0.0.1:1106`) cannot bind Content-Type or a content-length range, so a presigned-PUT flow lets clients upload arbitrary content of arbitrary size regardless of what metadata the API validated.

**Why:** A completion code review rejected the presigned flow for exactly this bypass (metadata-only validation, storage-abuse risk).

**How to apply:** Route uploads through the API (`express.raw` with a byte limit) and verify the real file type via magic-byte sniffing — never trust the client's Content-Type. Store the sniffed type as the object's contentType. Private object reads must be authenticated and role-checked; document the access model instead of leaving dead ACL template code around.
