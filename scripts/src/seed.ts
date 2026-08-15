/* Seed GovConnect 2.0 with rich Dutch sample data. Idempotent: truncates all tables first. */
import { db } from "@workspace/db";
import {
  usersTable,
  organizationsTable,
  sitesTable,
  buildingsTable,
  floorsTable,
  roomsTable,
  workplacesTable,
  ticketCategoriesTable,
  ticketsTable,
  ticketCommentsTable,
  cateringItemsTable,
  reservationsTable,
  cateringOrderLinesTable,
  visitorsTable,
  assetsTable,
  notificationsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { scryptSync, randomBytes } from "node:crypto";

// Same format as artifacts/api-server/src/lib/password.ts: s2:<saltHex>:<hashHex>
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `s2:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const PASSWORD = hashPassword("demo2026");
const SLA_HOURS: Record<string, number> = { P1: 4, P2: 8, P3: 24, P4: 72 };

function today(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600000);
}

async function main() {
  await db.execute(sql`
    TRUNCATE TABLE notifications, catering_order_lines, reservations, catering_items,
      ticket_comments, tickets, ticket_categories, assets, workplaces, rooms, floors,
      buildings, sites, organizations, visitors, users RESTART IDENTITY CASCADE
  `);

  // Users — one per role plus extras
  const users = await db
    .insert(usersTable)
    .values([
      { email: "emma@govconnect.nl", password: PASSWORD, name: "Emma de Vries", role: "eindgebruiker", department: "Burgerzaken", avatarColor: "#2563eb" },
      { email: "sander@govconnect.nl", password: PASSWORD, name: "Sander Bakker", role: "servicedesk", department: "Facilitair Bedrijf", avatarColor: "#0891b2" },
      { email: "fatima@govconnect.nl", password: PASSWORD, name: "Fatima el Idrissi", role: "facilitair_manager", department: "Facilitair Bedrijf", avatarColor: "#7c3aed" },
      { email: "joris@govconnect.nl", password: PASSWORD, name: "Joris van Dam", role: "cateraar", department: "Catering", avatarColor: "#ea580c" },
      { email: "linda@govconnect.nl", password: PASSWORD, name: "Linda Jansen", role: "receptie", department: "Receptie", avatarColor: "#db2777" },
      { email: "ruben@govconnect.nl", password: PASSWORD, name: "Ruben Smit", role: "beheerder", department: "Vastgoed & Beheer", avatarColor: "#059669" },
      { email: "kees@techniekpartners.nl", password: PASSWORD, name: "Kees Mulder", role: "leverancier", department: "Techniek Partners B.V.", avatarColor: "#64748b" },
      { email: "noor@govconnect.nl", password: PASSWORD, name: "Noor Visser", role: "eindgebruiker", department: "Ruimtelijke Ordening", avatarColor: "#0d9488" },
      { email: "daan@govconnect.nl", password: PASSWORD, name: "Daan Hoekstra", role: "eindgebruiker", department: "Financiën", avatarColor: "#b45309" },
      { email: "sophie@govconnect.nl", password: PASSWORD, name: "Sophie Meijer", role: "servicedesk", department: "Facilitair Bedrijf", avatarColor: "#4f46e5" },
    ])
    .returning();
  const byEmail = new Map(users.map((u) => [u.email.split("@")[0], u]));
  const u = (k: string) => byEmail.get(k)!;

  // Structure
  const [org] = await db.insert(organizationsTable).values({ name: "Gemeente Rijnstad" }).returning();
  const [siteC] = await db.insert(sitesTable).values({ organizationId: org!.id, name: "Vestiging Centrum", city: "Rijnstad" }).returning();
  const [siteN] = await db.insert(sitesTable).values({ organizationId: org!.id, name: "Vestiging Noord", city: "Rijnstad" }).returning();
  const [stadhuis] = await db.insert(buildingsTable).values({ siteId: siteC!.id, name: "Stadhuis", address: "Marktplein 1" }).returning();
  const [stadskantoor] = await db.insert(buildingsTable).values({ siteId: siteC!.id, name: "Stadskantoor", address: "Rijnkade 12" }).returning();
  const [werf] = await db.insert(buildingsTable).values({ siteId: siteN!.id, name: "Gemeentewerf", address: "Industrieweg 40" }).returning();

  const floors = await db
    .insert(floorsTable)
    .values([
      { buildingId: stadhuis!.id, name: "Begane grond", level: 0 },
      { buildingId: stadhuis!.id, name: "1e verdieping", level: 1 },
      { buildingId: stadhuis!.id, name: "2e verdieping", level: 2 },
      { buildingId: stadskantoor!.id, name: "Begane grond", level: 0 },
      { buildingId: stadskantoor!.id, name: "1e verdieping", level: 1 },
      { buildingId: werf!.id, name: "Begane grond", level: 0 },
    ])
    .returning();
  const [sh0, sh1, sh2, sk0, sk1, wf0] = floors as [any, any, any, any, any, any];

  const rooms = await db
    .insert(roomsTable)
    .values([
      { floorId: sh0.id, name: "Raadzaal", code: "SH-0.01", functionType: "vergaderruimte", areaM2: 180, floorFinish: "parket", capacity: 60, bookable: true, facilities: ["beamer", "geluidsinstallatie", "microfoons", "livestream"] },
      { floorId: sh0.id, name: "Trouwzaal", code: "SH-0.02", functionType: "ceremoniezaal", areaM2: 95, floorFinish: "parket", capacity: 40, bookable: true, facilities: ["geluidsinstallatie", "piano"] },
      { floorId: sh0.id, name: "Ontvangsthal", code: "SH-0.03", functionType: "ontvangst", areaM2: 220, floorFinish: "natuursteen", capacity: null, bookable: false, facilities: ["receptiebalie"] },
      { floorId: sh1.id, name: "Vergaderzaal De Rijn", code: "SH-1.04", functionType: "vergaderruimte", areaM2: 42, floorFinish: "tapijt", capacity: 12, bookable: true, facilities: ["scherm", "videobellen", "whiteboard"] },
      { floorId: sh1.id, name: "Vergaderzaal De Waal", code: "SH-1.05", functionType: "vergaderruimte", areaM2: 28, floorFinish: "tapijt", capacity: 8, bookable: true, facilities: ["scherm", "whiteboard"] },
      { floorId: sh1.id, name: "B&W-kamer", code: "SH-1.06", functionType: "vergaderruimte", areaM2: 55, floorFinish: "tapijt", capacity: 14, bookable: false, facilities: ["scherm", "videobellen"] },
      { floorId: sh2.id, name: "Focusruimte De Lek", code: "SH-2.07", functionType: "focusruimte", areaM2: 9, floorFinish: "tapijt", capacity: 2, bookable: true, facilities: ["scherm"] },
      { floorId: sh2.id, name: "Kantoortuin Zuid", code: "SH-2.08", functionType: "kantoortuin", areaM2: 310, floorFinish: "tapijt", capacity: 48, bookable: false, facilities: [] },
      { floorId: sk0.id, name: "Bedrijfsrestaurant", code: "SK-0.01", functionType: "restaurant", areaM2: 260, floorFinish: "pvc", capacity: 120, bookable: false, facilities: ["uitgiftebalie", "koffiecorner"] },
      { floorId: sk0.id, name: "Vergaderzaal De Maas", code: "SK-0.02", functionType: "vergaderruimte", areaM2: 36, floorFinish: "pvc", capacity: 10, bookable: true, facilities: ["scherm", "videobellen"] },
      { floorId: sk1.id, name: "Vergaderzaal De IJssel", code: "SK-1.03", functionType: "vergaderruimte", areaM2: 24, floorFinish: "tapijt", capacity: 6, bookable: true, facilities: ["scherm"] },
      { floorId: sk1.id, name: "Kantoortuin Noord", code: "SK-1.04", functionType: "kantoortuin", areaM2: 280, floorFinish: "tapijt", capacity: 40, bookable: false, facilities: [] },
      { floorId: wf0.id, name: "Werkplaats", code: "GW-0.01", functionType: "werkplaats", areaM2: 450, floorFinish: "beton", capacity: null, bookable: false, facilities: ["hefbrug", "gereedschap"] },
      { floorId: wf0.id, name: "Kantine Werf", code: "GW-0.02", functionType: "kantine", areaM2: 60, floorFinish: "pvc", capacity: 24, bookable: false, facilities: ["koffiecorner"] },
    ])
    .returning();
  const room = (code: string) => rooms.find((r) => r.code === code)!;

  const workplaces = await db
    .insert(workplacesTable)
    .values([
      ...Array.from({ length: 12 }, (_, i) => ({
        floorId: sh2.id as number,
        name: `Flexplek Z${i + 1}`,
        code: `SH-2-Z${String(i + 1).padStart(2, "0")}`,
        zone: "Zone Zuid",
        features: i % 3 === 0 ? ["dubbel scherm", "zit-sta bureau"] : i % 3 === 1 ? ["dubbel scherm"] : ["stiltezone"],
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        floorId: sk1.id as number,
        name: `Flexplek N${i + 1}`,
        code: `SK-1-N${String(i + 1).padStart(2, "0")}`,
        zone: "Zone Noord",
        features: i % 2 === 0 ? ["dubbel scherm", "dockingstation"] : ["zit-sta bureau"],
      })),
    ])
    .returning();

  // Assets
  const assets = await db
    .insert(assetsTable)
    .values([
      { name: "Beamer Raadzaal", code: "AST-0001", category: "audiovisueel", brand: "Epson", model: "EB-PU1007B", serialNumber: "EP-88213", roomId: room("SH-0.01").id, status: "in_gebruik", purchaseDate: "2023-03-15" },
      { name: "Koffiemachine restaurant", code: "AST-0002", category: "keukenapparatuur", brand: "Jura", model: "GIGA X8", serialNumber: "JU-55901", roomId: room("SK-0.01").id, status: "defect", purchaseDate: "2022-06-01" },
      { name: "Klimaatinstallatie Stadhuis", code: "AST-0003", category: "installaties", brand: "Daikin", model: "VRV IV", serialNumber: "DK-11209", roomId: null, status: "in_onderhoud", purchaseDate: "2019-09-20" },
      { name: "Scherm De Rijn", code: "AST-0004", category: "audiovisueel", brand: "Samsung", model: "QM85R", serialNumber: "SM-73320", roomId: room("SH-1.04").id, status: "in_gebruik", purchaseDate: "2024-01-10" },
      { name: "Toegangspoortjes hal", code: "AST-0005", category: "beveiliging", brand: "Boon Edam", model: "Speedlane", serialNumber: "BE-40011", roomId: room("SH-0.03").id, status: "in_gebruik", purchaseDate: "2021-11-05" },
      { name: "Vaatwasser kantine werf", code: "AST-0006", category: "keukenapparatuur", brand: "Miele", model: "PG 8058", serialNumber: "MI-20976", roomId: room("GW-0.02").id, status: "in_gebruik", purchaseDate: "2020-04-18" },
      { name: "Hefbrug werkplaats", code: "AST-0007", category: "installaties", brand: "Stertil-Koni", model: "ST 4175", serialNumber: "SK-90341", roomId: room("GW-0.01").id, status: "in_gebruik", purchaseDate: "2018-02-27" },
      { name: "AED ontvangsthal", code: "AST-0008", category: "veiligheid", brand: "Philips", model: "HeartStart HS1", serialNumber: "PH-66102", roomId: room("SH-0.03").id, status: "in_gebruik", purchaseDate: "2023-08-30" },
    ])
    .returning();
  const asset = (code: string) => assets.find((a) => a.code === code)!;

  // Ticket categories with dynamic form fields
  const categories = await db
    .insert(ticketCategoriesTable)
    .values([
      {
        name: "Storing klimaat", description: "Te warm, te koud of geen ventilatie", defaultPriority: "P2", routeToRole: "servicedesk",
        formFields: [
          { key: "klacht", label: "Aard van de klacht", type: "select", required: true, options: ["Te warm", "Te koud", "Tocht", "Geen ventilatie", "Vreemde geur"] },
          { key: "sinds", label: "Sinds wanneer", type: "date", required: false },
        ],
      },
      {
        name: "Schoonmaak", description: "Extra schoonmaak of vervuiling melden", defaultPriority: "P3", routeToRole: "servicedesk",
        formFields: [
          { key: "soort", label: "Soort vervuiling", type: "select", required: true, options: ["Gemorste vloeistof", "Vuilnis", "Sanitair", "Glas", "Overig"] },
          { key: "spoed", label: "Direct gevaar voor uitglijden?", type: "checkbox", required: false },
        ],
      },
      {
        name: "Technische storing", description: "Defecte apparatuur of installaties", defaultPriority: "P2", routeToRole: "leverancier",
        formFields: [
          { key: "apparaat", label: "Welk apparaat of installatie", type: "text", required: true },
          { key: "foutmelding", label: "Foutmelding (indien zichtbaar)", type: "text", required: false },
          { key: "uitval", label: "Volledig buiten gebruik?", type: "checkbox", required: false },
        ],
      },
      {
        name: "Verlichting", description: "Kapotte of flikkerende verlichting", defaultPriority: "P3", routeToRole: "servicedesk",
        formFields: [
          { key: "aantal", label: "Aantal armaturen", type: "number", required: true },
          { key: "flikkert", label: "Flikkert de verlichting?", type: "checkbox", required: false },
        ],
      },
      {
        name: "Veiligheid", description: "Onveilige situatie of schade", defaultPriority: "P1", routeToRole: "facilitair_manager",
        formFields: [
          { key: "situatie", label: "Omschrijf de situatie", type: "textarea", required: true },
          { key: "afgezet", label: "Is de locatie afgezet?", type: "checkbox", required: false },
        ],
      },
      {
        name: "Sanitair", description: "Verstopping, lekkage of defect sanitair", defaultPriority: "P2", routeToRole: "servicedesk",
        formFields: [
          { key: "probleem", label: "Probleem", type: "select", required: true, options: ["Verstopping", "Lekkage", "Geen warm water", "Defecte kraan", "Overig"] },
        ],
      },
      {
        name: "Overig", description: "Alle overige meldingen", defaultPriority: "P4", routeToRole: "servicedesk",
        formFields: [],
      },
    ])
    .returning();
  const cat = (name: string) => categories.find((c) => c.name === name)!;

  // Tickets in various statuses
  const mkSla = (createdAt: Date, prio: string) => new Date(createdAt.getTime() + (SLA_HOURS[prio] ?? 24) * 3600000);
  const ticketRows = [
    { number: "GC-2026-1001", title: "Koffiemachine restaurant defect", description: "De grote koffiemachine in het bedrijfsrestaurant geeft foutmelding E8 en doet het niet meer.", status: "in_behandeling", priority: "P2", categoryId: cat("Technische storing").id, roomId: room("SK-0.01").id, assetId: asset("AST-0002").id, reporterId: u("joris").id, assigneeId: u("kees").id, formData: { apparaat: "Jura GIGA X8", foutmelding: "E8", uitval: true }, createdAt: hoursAgo(6) },
    { number: "GC-2026-1002", title: "Te warm in Kantoortuin Zuid", description: "Sinds vanochtend is het ruim 26 graden op de tweede verdieping, collega's klagen.", status: "nieuw", priority: "P2", categoryId: cat("Storing klimaat").id, roomId: room("SH-2.08").id, assetId: asset("AST-0003").id, reporterId: u("noor").id, assigneeId: u("sander").id, formData: { klacht: "Te warm", sinds: today() }, createdAt: hoursAgo(3) },
    { number: "GC-2026-1003", title: "Gemorste koffie bij lift", description: "Bij de lift op de begane grond van het Stadskantoor ligt gemorste koffie.", status: "gereed", priority: "P3", categoryId: cat("Schoonmaak").id, roomId: room("SK-0.01").id, assetId: null, reporterId: u("daan").id, assigneeId: u("sander").id, formData: { soort: "Gemorste vloeistof", spoed: true }, createdAt: hoursAgo(28) },
    { number: "GC-2026-1004", title: "Losliggende stoeptegel bij ingang", description: "Voor de hoofdingang van het Stadhuis ligt een stoeptegel los, struikelgevaar voor bezoekers.", status: "ingepland", priority: "P1", categoryId: cat("Veiligheid").id, roomId: room("SH-0.03").id, assetId: null, reporterId: u("linda").id, assigneeId: u("fatima").id, formData: { situatie: "Losliggende tegel direct voor de draaideur, meerdere mensen bijna gestruikeld.", afgezet: true }, createdAt: hoursAgo(2), plannedAt: new Date(Date.now() + 20 * 3600000) },
    { number: "GC-2026-1005", title: "Verlichting flikkert in De Waal", description: "Twee armaturen in vergaderzaal De Waal flikkeren tijdens vergaderingen.", status: "wacht_op_info", priority: "P3", categoryId: cat("Verlichting").id, roomId: room("SH-1.05").id, assetId: null, reporterId: u("emma").id, assigneeId: u("sophie").id, formData: { aantal: 2, flikkert: true }, createdAt: hoursAgo(50) },
    { number: "GC-2026-1006", title: "Verstopping toilet 1e verdieping", description: "Het herentoilet naast vergaderzaal De Rijn is verstopt.", status: "in_behandeling", priority: "P2", categoryId: cat("Sanitair").id, roomId: room("SH-1.04").id, assetId: null, reporterId: u("daan").id, assigneeId: u("sander").id, formData: { probleem: "Verstopping" }, createdAt: hoursAgo(5) },
    { number: "GC-2026-1007", title: "Klimaatinstallatie maakt lawaai", description: "De klimaatinstallatie op het dak van het Stadhuis maakt een brommend geluid.", status: "ingepland", priority: "P3", categoryId: cat("Technische storing").id, roomId: null, assetId: asset("AST-0003").id, reporterId: u("ruben").id, assigneeId: u("kees").id, formData: { apparaat: "Daikin VRV IV", uitval: false }, createdAt: hoursAgo(75), plannedAt: new Date(Date.now() + 48 * 3600000) },
    { number: "GC-2026-1008", title: "Beamer Raadzaal valt uit", description: "Tijdens de raadsvergadering viel de beamer twee keer uit.", status: "gesloten", priority: "P2", categoryId: cat("Technische storing").id, roomId: room("SH-0.01").id, assetId: asset("AST-0001").id, reporterId: u("emma").id, assigneeId: u("kees").id, formData: { apparaat: "Epson beamer", foutmelding: "Overheating" }, createdAt: hoursAgo(200) },
    { number: "GC-2026-1009", title: "Vuilnis niet opgehaald bij werf", description: "De containers bij de Gemeentewerf zijn deze week niet geleegd.", status: "nieuw", priority: "P4", categoryId: cat("Overig").id, roomId: room("GW-0.01").id, assetId: null, reporterId: u("noor").id, assigneeId: u("sander").id, formData: {}, createdAt: hoursAgo(1) },
    { number: "GC-2026-1010", title: "Toegangspoortje blijft open staan", description: "Het rechter toegangspoortje in de ontvangsthal sluit niet meer automatisch.", status: "nieuw", priority: "P1", categoryId: cat("Veiligheid").id, roomId: room("SH-0.03").id, assetId: asset("AST-0005").id, reporterId: u("linda").id, assigneeId: u("fatima").id, formData: { situatie: "Poortje staat permanent open, iedereen kan zonder pas naar binnen.", afgezet: false }, createdAt: hoursAgo(1.5) },
  ] as const;
  const tickets = await db
    .insert(ticketsTable)
    .values(ticketRows.map((t) => ({ ...t, formData: t.formData as Record<string, unknown>, slaDueAt: mkSla(t.createdAt, t.priority) })))
    .returning();
  const ticket = (num: string) => tickets.find((t) => t.number === num)!;

  await db.insert(ticketCommentsTable).values([
    { ticketId: ticket("GC-2026-1001").id, authorId: u("kees").id, body: "Onderdeel besteld bij Jura, levertijd 2 werkdagen. Ik plan de reparatie in zodra het binnen is.", createdAt: hoursAgo(4) },
    { ticketId: ticket("GC-2026-1001").id, authorId: u("joris").id, body: "Dank! Kunnen we tot die tijd de reservemachine uit de kelder gebruiken?", createdAt: hoursAgo(3.5) },
    { ticketId: ticket("GC-2026-1004").id, authorId: u("fatima").id, body: "Aannemer komt morgenochtend om 8:00 uur. Locatie is afgezet met pionnen.", createdAt: hoursAgo(1) },
    { ticketId: ticket("GC-2026-1005").id, authorId: u("sophie").id, body: "Kun je aangeven om welke armaturen het gaat? Links of rechts van het scherm?", createdAt: hoursAgo(40) },
    { ticketId: ticket("GC-2026-1008").id, authorId: u("kees").id, body: "Stoffilter vervangen en firmware geüpdatet. Probleem verholpen.", createdAt: hoursAgo(180) },
  ]);

  // Catering
  const cateringItems = await db
    .insert(cateringItemsTable)
    .values([
      { name: "Koffie & thee arrangement", description: "Verse koffie en diverse theesoorten, per persoon", price: 2.5, category: "dranken" },
      { name: "Verse jus d'orange (1L)", description: "Vers geperst, per kan", price: 6.5, category: "dranken" },
      { name: "Luxe belegde broodjes", description: "Assortiment per stuk", price: 4.75, category: "lunch" },
      { name: "Vegetarische lunchbox", description: "Salade, wrap en fruit", price: 9.5, category: "lunch" },
      { name: "Soep van de dag", description: "Per kop, incl. brood", price: 3.95, category: "lunch" },
      { name: "Fruitmand", description: "Seizoensfruit voor 10 personen", price: 12.0, category: "snacks" },
      { name: "Gebak bij de koffie", description: "Per stuk, wisselend assortiment", price: 3.25, category: "snacks" },
      { name: "Borrelplank", description: "Kaas, worst en nootjes voor 8 personen", price: 27.5, category: "borrel" },
    ])
    .returning();
  const item = (name: string) => cateringItems.find((i) => i.name === name)!;

  // Reservations (rooms) today & upcoming
  const reservations = await db
    .insert(reservationsTable)
    .values([
      { kind: "room", roomId: room("SH-1.04").id, userId: u("emma").id, title: "Teamoverleg Burgerzaken", date: today(), startTime: "09:00", endTime: "10:30", attendees: 10, setupBufferMin: 15, cleanupBufferMin: 15, status: "ingecheckt" },
      { kind: "room", roomId: room("SH-0.01").id, userId: u("fatima").id, title: "Raadscommissie Ruimte", date: today(), startTime: "19:30", endTime: "22:00", attendees: 45, setupBufferMin: 60, cleanupBufferMin: 30, status: "bevestigd" },
      { kind: "room", roomId: room("SK-0.02").id, userId: u("daan").id, title: "Budgetbespreking Q3", date: today(), startTime: "11:00", endTime: "12:00", attendees: 6, setupBufferMin: 0, cleanupBufferMin: 0, status: "bevestigd" },
      { kind: "room", roomId: room("SH-1.05").id, userId: u("noor").id, title: "Projectgroep Omgevingswet", date: today(), startTime: "13:30", endTime: "15:00", attendees: 7, setupBufferMin: 15, cleanupBufferMin: 0, status: "bevestigd" },
      { kind: "room", roomId: room("SK-1.03").id, userId: u("sander").id, title: "Werkoverleg servicedesk", date: today(), startTime: "15:30", endTime: "16:15", attendees: 5, setupBufferMin: 0, cleanupBufferMin: 0, status: "bevestigd" },
      { kind: "room", roomId: room("SH-0.02").id, userId: u("linda").id, title: "Huwelijksvoltrekking Peters-Van Leeuwen", date: today(1), startTime: "14:00", endTime: "15:00", attendees: 38, setupBufferMin: 45, cleanupBufferMin: 30, status: "bevestigd" },
      { kind: "room", roomId: room("SH-1.04").id, userId: u("fatima").id, title: "MT Facilitair", date: today(1), startTime: "10:00", endTime: "11:30", attendees: 8, setupBufferMin: 15, cleanupBufferMin: 15, status: "bevestigd" },
      { kind: "room", roomId: room("SK-0.02").id, userId: u("emma").id, title: "Sollicitatiegesprekken", date: today(2), startTime: "09:00", endTime: "12:30", attendees: 4, setupBufferMin: 0, cleanupBufferMin: 0, status: "bevestigd" },
      { kind: "room", roomId: room("SH-1.04").id, userId: u("daan").id, title: "Kwartaalafsluiting", date: today(-1), startTime: "13:00", endTime: "14:30", attendees: 9, setupBufferMin: 15, cleanupBufferMin: 15, status: "uitgecheckt" },
      // Workplace bookings today
      { kind: "workplace", workplaceId: workplaces[0]!.id, userId: u("emma").id, title: "Werkplekboeking", date: today(), startTime: "08:30", endTime: "17:00", status: "ingecheckt" },
      { kind: "workplace", workplaceId: workplaces[3]!.id, userId: u("noor").id, title: "Werkplekboeking", date: today(), startTime: "09:00", endTime: "17:30", status: "bevestigd" },
      { kind: "workplace", workplaceId: workplaces[13]!.id, userId: u("daan").id, title: "Werkplekboeking", date: today(), startTime: "08:00", endTime: "16:00", status: "bevestigd" },
      { kind: "workplace", workplaceId: workplaces[5]!.id, userId: u("sophie").id, title: "Werkplekboeking", date: today(1), startTime: "09:00", endTime: "17:00", status: "bevestigd" },
    ])
    .returning();

  await db.insert(cateringOrderLinesTable).values([
    { reservationId: reservations[0]!.id, cateringItemId: item("Koffie & thee arrangement").id, quantity: 10, unitPrice: 2.5 },
    { reservationId: reservations[0]!.id, cateringItemId: item("Gebak bij de koffie").id, quantity: 10, unitPrice: 3.25 },
    { reservationId: reservations[1]!.id, cateringItemId: item("Koffie & thee arrangement").id, quantity: 45, unitPrice: 2.5 },
    { reservationId: reservations[1]!.id, cateringItemId: item("Borrelplank").id, quantity: 4, unitPrice: 27.5 },
    { reservationId: reservations[3]!.id, cateringItemId: item("Luxe belegde broodjes").id, quantity: 14, unitPrice: 4.75 },
    { reservationId: reservations[3]!.id, cateringItemId: item("Verse jus d'orange (1L)").id, quantity: 2, unitPrice: 6.5 },
    { reservationId: reservations[7]!.id, cateringItemId: item("Koffie & thee arrangement").id, quantity: 4, unitPrice: 2.5 },
  ]);

  // Visitors
  await db.insert(visitorsTable).values([
    { name: "Peter van den Berg", company: "Bouwbedrijf Van den Berg", email: "p.vdberg@vdberg.nl", hostId: u("fatima").id, visitDate: today(), expectedArrival: "09:30", badgeCode: "BZ-K3M9X2", status: "aanwezig", checkedInAt: hoursAgo(2) },
    { name: "Anouk Willems", company: "Adviesbureau Ruimte & Co", email: "anouk@ruimteco.nl", hostId: u("noor").id, visitDate: today(), expectedArrival: "11:00", badgeCode: "BZ-P7T2Q8", status: "verwacht" },
    { name: "Mohammed Aziz", company: null, email: null, hostId: u("emma").id, visitDate: today(), expectedArrival: "14:00", badgeCode: "BZ-R4W6N1", status: "verwacht" },
    { name: "Carla Dijkstra", company: "Gemeente Waterland", email: "c.dijkstra@waterland.nl", hostId: u("fatima").id, visitDate: today(), expectedArrival: "08:45", badgeCode: "BZ-H8J3L5", status: "vertrokken", checkedInAt: hoursAgo(5), checkedOutAt: hoursAgo(2.5) },
    { name: "Thijs Kramer", company: "Techniek Partners B.V.", email: "t.kramer@techniekpartners.nl", hostId: u("ruben").id, visitDate: today(1), expectedArrival: "10:00", badgeCode: "BZ-D2F9S7", status: "verwacht" },
    { name: "Els van Houten", company: "Provincie", email: "e.vanhouten@provincie.nl", hostId: u("fatima").id, visitDate: today(1), expectedArrival: "13:30", badgeCode: "BZ-M6B1V4", status: "verwacht" },
  ]);

  // Notifications
  await db.insert(notificationsTable).values([
    { userId: u("sander").id, title: "Nieuwe melding GC-2026-1002", body: "Te warm in Kantoortuin Zuid (P2) is aan jou toegewezen.", kind: "ticket", linkPath: "/meldingen/" + ticket("GC-2026-1002").id, read: false, createdAt: hoursAgo(3) },
    { userId: u("sander").id, title: "Nieuwe melding GC-2026-1009", body: "Vuilnis niet opgehaald bij werf (P4) is aan jou toegewezen.", kind: "ticket", linkPath: "/meldingen/" + ticket("GC-2026-1009").id, read: false, createdAt: hoursAgo(1) },
    { userId: u("kees").id, title: "Nieuwe melding GC-2026-1001", body: "Koffiemachine restaurant defect (P2) is aan jou toegewezen.", kind: "ticket", linkPath: "/meldingen/" + ticket("GC-2026-1001").id, read: true, createdAt: hoursAgo(6) },
    { userId: u("fatima").id, title: "SLA-waarschuwing", body: "Melding GC-2026-1010 nadert de SLA-deadline.", kind: "ticket", linkPath: "/meldingen/" + ticket("GC-2026-1010").id, read: false, createdAt: hoursAgo(0.5) },
    { userId: u("emma").id, title: "Reservering bevestigd", body: "Teamoverleg Burgerzaken vandaag om 09:00 in De Rijn.", kind: "reservering", linkPath: "/reserveringen/" + reservations[0]!.id, read: true, createdAt: hoursAgo(24) },
    { userId: u("fatima").id, title: "Je bezoeker is gearriveerd", body: "Peter van den Berg heeft ingecheckt bij de receptie.", kind: "bezoeker", linkPath: "/bezoekers", read: false, createdAt: hoursAgo(2) },
    { userId: u("joris").id, title: "Nieuwe cateringbestelling", body: "Bij Raadscommissie Ruimte vanavond is catering besteld voor 45 personen.", kind: "reservering", linkPath: "/reserveringen/" + reservations[1]!.id, read: false, createdAt: hoursAgo(12) },
    { userId: u("linda").id, title: "Systeemonderhoud", body: "Zaterdag tussen 22:00 en 23:00 is GovConnect kort niet beschikbaar.", kind: "systeem", linkPath: null, read: false, createdAt: hoursAgo(30) },
  ]);

  console.log("Seed voltooid:", {
    users: users.length,
    rooms: rooms.length,
    workplaces: workplaces.length,
    tickets: tickets.length,
    reservations: reservations.length,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
