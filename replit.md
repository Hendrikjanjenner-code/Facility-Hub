# GovConnect 2.0

Modulair facilitair managementplatform (SaaS) voor overheidsorganisaties. Volledig Nederlandstalige interface.

## Overview
- **Frontend**: `artifacts/govconnect` — React + Vite + Tailwind + shadcn, wouter routing, TanStack Query via Orval-hooks (`@workspace/api-client-react`). Preview path `/`.
- **Backend**: `artifacts/api-server` — Express 5, pino logging, sessie-auth via signed cookie (`SESSION_SECRET`), routes in `src/routes/*`.
- **Database**: PostgreSQL via Drizzle (`lib/db/src/schema/*`). Push: `pnpm --filter @workspace/db run push`.
- **API-contract**: `lib/api-spec/openapi.yaml` → codegen: `pnpm --filter @workspace/api-spec run codegen` (rewrites zod import naar `zod/v4` — Orval genereert Zod v4 API).

## Modules (MVP)
- Auth + 7 rollen (eindgebruiker, servicedesk, facilitair_manager, cateraar, receptie, beheerder, leverancier), rolgebaseerde dashboards & sidebar.
- Meldingen (tickets): statussen nieuw→gesloten, SLA P1–P4 (4/8/24/72 uur) met countdown, dynamische categorievelden, auto-routering naar rol, reacties.
- Reserveringen: ruimtes (planbord, buffers, catering, conflictdetectie 409) + werkplekken.
- Bezoekers: badge-status verwacht/aanwezig/vertrokken, check-in/out.
- Vastgoed: structuurboom, ruimteregister, assets.
- Notificaties: in-app, per gebruiker.
- MJOP: bouwdeelregistratie gekoppeld aan gebouwstructuur, conditiemeting NEN 2767 (score 1–6, gebreken met foto-upload via App Storage), MJOP-taken met kostenraming, jaarplanningsoverzicht, taak → servicedesk-ticket conversie. Rollen: facilitair_manager, beheerder.
- Object storage (App Storage): presigned-URL uploads via `/api/storage/uploads/request-url`, serving via `/api/storage/objects/*` (routes in `api-server/src/routes/storage.ts`).

## Demo accounts
Alle accounts gebruiken wachtwoord `demo2026` (zie loginpagina, 1-klik login). Seed: `pnpm --filter @workspace/scripts run seed` (truncate + herseed).

## User preferences
- Volledig Nederlandstalige UI, zakelijke SaaS-stijl, geen emoji's.
