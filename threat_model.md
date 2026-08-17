# Threat Model — GovConnect 2.0

## Project Overview

GovConnect 2.0 is a Dutch-language SaaS facility-management platform for government organisations. The tech stack is React + Vite (frontend), Express 5 with pino logging and signed-cookie session auth (backend), and PostgreSQL via Drizzle ORM (database). It is hosted on Replit and is not yet deployed to production (no active deployment detected as of this scan). The application manages tickets/helpdesk, room/building reservations, visitor registration, contract & supplier management, shop/webshop with budget enforcement, key & pass management, MJOP building inspections, and object storage for inspection photos and contract documents.

## Assets

- **User credentials & sessions** — Email/password pairs hashed with scrypt (s2 format). Signed session cookies (`gc_session`) with a 7-day TTL. Compromise allows impersonation at the user's privilege level.
- **Contract and supplier data** — Contract documents (PDFs/images) stored in private object storage; annual values, notice periods, and supplier contact details. Accessible to `facilitair_manager` and `beheerder` roles; suppliers see only their own contracts.
- **Building and MJOP data** — Inspection photos, condition scores, and cost estimates for building components. Access restricted to `facilitair_manager` and `beheerder`.
- **Personal data** — Employee names, email addresses, department assignments, visitor records. Accessible to authenticated internal users; the `/api/users` staff directory is restricted to roles that manage tickets and visitors.
- **Shop orders and budgets** — Procurement orders, department budgets, approval records. Managers can view all; regular users see only their own orders.
- **Application secrets** — `SESSION_SECRET` (session signing key), database URL, SMTP credentials, `APP_URL`. Must not appear in client bundles or logs.
- **Object storage contents** — MJOP inspection photos and building/contract documents served via `/api/storage/objects/*`. Private; accessible only to `facilitair_manager` and `beheerder`. Uploads validated by magic bytes.

## Trust Boundaries

- **Browser → API** — All client requests cross this boundary. The API enforces authentication (`requireAuth` middleware) and role checks (`requireRole`) server-side. The frontend role-based UI is not a security control.
- **API → PostgreSQL** — Drizzle ORM generates parameterized queries throughout; no raw string interpolation observed in application-level queries. Sensitive expressions use `drizzle-orm/sql` tagged templates.
- **API → Object Storage (GCS)** — Internal calls via `@google-cloud/storage`. Storage credentials are held server-side only; presigned URLs are not exposed to users.
- **Authenticated → Unauthenticated** — All data routes require a valid signed session cookie. `GET /api/auth/demo-accounts` and `GET /api/health` are the only unauthenticated endpoints.
- **User roles (7 levels)** — `eindgebruiker`, `servicedesk`, `facilitair_manager`, `cateraar`, `receptie`, `beheerder`, `leverancier`. Server-side `requireRole` checks guard elevated operations. Cross-role isolation is enforced per-query for `leverancier` (supplier sees own contracts/orders only).
- **Public vs private object storage** — `/api/storage/public-objects/*` serves public assets with no authentication; `/api/storage/objects/*` requires `facilitair_manager` or `beheerder` role.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/routes/` — auth.ts, tickets.ts, contracts.ts, storage.ts, shop.ts, vastgoed.ts, keys.ts, reservations.ts, visitors.ts, mjop.ts, notifications.ts, user-preferences.ts, satisfaction.ts, sustainability.ts, knowledge.ts, assets.ts, dashboard.ts.
- **Highest-risk areas:** `contracts.ts` (supplier document access/download), `storage.ts` (file upload/serve), `auth.ts` (login, session), `shop.ts` (budget enforcement, supplier order visibility).
- **Public surface:** `GET /api/auth/demo-accounts`, `GET /api/health`, `GET /api/storage/public-objects/*`.
- **Authenticated surface:** All other `/api/*` routes — protected by `requireAuth` middleware.
- **Admin/manager surface:** Routes guarded by `requireRole("facilitair_manager", "beheerder")` — MJOP, contracts, building documents, shop budget management, storage uploads.
- **Supplier-scoped surface:** `GET /contracts`, `GET /contracts/:id/documents`, `GET /contracts/:id/documents/:docId/download`, `GET /shop/orders` — filtered server-side by `suppliersTable.userId = currentUser.id`.
- **Dev-only:** `artifacts/mockup-sandbox` — Replit Canvas/design mockups, not reachable in production API.

## Threat Categories

### Spoofing

Users authenticate via email + scrypt-hashed password. The session cookie is signed with `SESSION_SECRET`; the server refuses to start without it (`throw new Error(...)`). Sessions last 7 days with no server-side revocation mechanism. The login endpoint (`POST /api/auth/login`) has **no rate limiting**, making it vulnerable to automated password guessing. An attacker who compromises a `beheerder` account gains access to all contracts, building data, and storage objects.

**Required guarantee:** `POST /api/auth/login` MUST apply a per-IP or per-email rate limit in production.

### Tampering

Ticket creation (`POST /api/tickets`) and ticket updates (`PATCH /api/tickets/:id`) both use the wrong Zod validation schema (`CreateTicketCommentBody` instead of `CreateTicketBody`/`UpdateTicketBody`). This causes: (a) ticket creation to always throw a `ReferenceError` (HTTP 500), and (b) ticket updates to either return 400 or silently write nothing. The access-control checks inside these handlers (role checks, reporter-scoping) are therefore either unreachable or ineffective. The MJOP auto-complete-on-close logic also never executes.

All other mutation endpoints use the correct schemas and parameterized ORM queries.

**Required guarantee:** `POST /api/tickets` and `PATCH /api/tickets/:id` MUST use their respective correct Zod schemas and MUST not reference undeclared variables.

### Information Disclosure

- `app.use(cors())` with no options emits `Access-Control-Allow-Origin: *`. Cookie-gated endpoints are not affected (browsers block credentials with wildcard CORS), but unauthenticated endpoints (notably `GET /api/auth/demo-accounts` when DEMO_MODE is enabled) are cross-origin readable by any website. In production without DEMO_MODE this is empty data; the risk is that a future unauthenticated endpoint would immediately be cross-origin accessible.
- The `GET /tickets/:id` handler fetches the ticket a second time after the `canViewTicket` check and returns the raw DB row (all columns), not the serialized format used by the list endpoint. This may expose internal fields, but the auth check is present.
- Error responses from Express use the default pino/Express error handler; stack traces are suppressed in production (`NODE_ENV=production`).

**Required guarantee:** CORS MUST be restricted to the known frontend origin(s) before production deployment.

### Denial of Service

- Broken `POST /api/tickets` and `PATCH /api/tickets/:id` make the entire helpdesk workflow unavailable. SLA timers never start, tickets cannot be assigned or closed, and MJOP tasks linked to tickets cannot be auto-completed.
- File upload endpoints cap at 10 MB (inspection photos) and 15 MB (documents) and validate MIME type via magic bytes. No per-user upload rate limiting, but uploads are restricted to manager roles.
- No request body size limit is set globally; `express.json()` uses Express's default (100 KB). Large JSON payloads to other endpoints are constrained only by this limit.

### Elevation of Privilege

- Role checks are enforced server-side via `requireRole` middleware chained before handlers on all privileged routes. No client-side-only role enforcement was observed in the API.
- Supplier isolation (`leverancier`) is enforced by joining `suppliersTable.userId = currentUser.id` on all supplier-visible list and download endpoints (contracts, shop orders).
- Object storage for private files (`/api/storage/objects/*`) requires `facilitair_manager` or `beheerder` role but does not scope to a specific object owner. Any user in these roles can download any private object. This is intentional for shared MJOP inspection workflows.
- SQL injection risk is low: all queries use Drizzle ORM parameterized bindings. The one raw `sql\`...\`` template in `contracts.ts` (sub-query for owner name) uses a column reference, not user input.
