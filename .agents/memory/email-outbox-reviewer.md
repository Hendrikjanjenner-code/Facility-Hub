---
name: Email outbox reviewer requirements
description: What the code reviewer demands for any email outbox / retry-queue implementation in this project.
---

# Email outbox reviewer requirements

## The rules

- **No hard attempt cap**: do not use `MAX_EMAIL_ATTEMPTS`. Retries must be indefinite with exponential backoff (1h → 2h → 4h, capped at 24h). Any finite cap was rejected three times.
- **Optimistic concurrency**: claim each queue entry by matching the exact `lastAttemptAt` value read from the DB (`WHERE id = ? AND lastAttemptAt IS NULL` or `WHERE id = ? AND lastAttemptAt = ?`). Do not use a time-window (`lastAttemptAt < now - CLAIM_WINDOW`) — that is vulnerable to concurrent runs.
- **Hourly processing interval**: `setInterval(..., 60 * 60 * 1000)` in `index.ts`, not just on startup + once/day. The 1h/2h/4h backoff is meaningless if the processor only runs daily.
- **Startup migration**: add `CREATE TABLE IF NOT EXISTS email_queue (...)` as an idempotent startup query alongside the other inline migrations — do not rely solely on schema files.
- **Lifecycle cleanup**: when a contract is renewed (endDate changed), deactivated (status ≠ "actief"), or deleted, delete unsent (`sentAt IS NULL`) queue rows matching `contract:{id}:%`. Never delete already-sent rows.
- **SMTP-not-configured rollback**: when `sendContractExpiryEmail` throws with `.smtpNotConfigured = true`, roll back the `attempts` increment so the entry doesn't burn retries while SMTP is absent.
- **Tests required**: at minimum cover disabled SMTP (no DB touch), successful delivery (sentAt set), transient SMTP failure (attempts++, no sentAt), smtpNotConfigured rollback, backoff window (skipped), and lifecycle cleanup (renewal/deactivation/deletion cancel unsent rows, sent rows untouched).

**Why:** Every rejected version missing one of these was explicitly called out in the review verdict. The reviewer treats silent email loss (missed retries, stale queue rows after renewal) as a concrete user-facing regression.

**How to apply:** When implementing or modifying any email queue / outbox feature, satisfy all seven rules above before submitting. Run `pnpm --filter @workspace/api-server run typecheck` to confirm no TS errors.
