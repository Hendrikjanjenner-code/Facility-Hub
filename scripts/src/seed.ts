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
  ticketSatisfactionTable,
  cateringItemsTable,
  reservationsTable,
  cateringOrderLinesTable,
  visitorsTable,
  assetsTable,
  notificationsTable,
  suppliersTable,
  contractsTable,
  contractDocumentsTable,
  supplierReviewsTable,
  shopProductsTable,
  budgetsTable,
  shopOrdersTable,
  shopOrderLinesTable,
  approvalThresholdTable,
  meterReadingsTable,
  wasteRegistrationsTable,
  bouwdelenTable,
  conditiemetingenTable,
  mjopTakenTable,
  kostenKengetallenTable,
  mjopScenariosTable,
  knowledgeArticlesTable,
  keysTable,
  keyDoorsTable,
  keyIssuesTable,
  keyLossReportsTable,
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
    TRUNCATE TABLE mjop_taken, mjop_scenarios, kosten_kengetallen, conditiemetingen, bouwdelen,
      notifications, catering_order_lines, reservations, catering_items,
      ticket_satisfaction, ticket_comments, tickets, ticket_categories, assets, workplaces, rooms, floors,
      shop_order_lines, shop_orders, shop_products, budgets, approval_threshold, contracts,
      contract_documents, supplier_reviews, suppliers,
      key_loss_reports, key_issues, key_doors, keys, building_documents,
      meter_readings, waste_registrations,
      buildings, sites, organizations, visitors, users, knowledge_articles RESTART IDENTITY CASCADE
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
      { floorId: sh0.id, name: "Raadzaal", code: "SH-0.01", functionType: "vergaderruimte", areaM2: 180, areaVvoM2: 172, areaBvoM2: 205, department: "Bestuur", floorFinish: "parket", capacity: 60, bookable: true, facilities: ["beamer", "geluidsinstallatie", "microfoons", "livestream"] },
      { floorId: sh0.id, name: "Trouwzaal", code: "SH-0.02", functionType: "ceremoniezaal", areaM2: 95, areaVvoM2: 90, areaBvoM2: 108, department: "Burgerzaken", floorFinish: "parket", capacity: 40, bookable: true, facilities: ["geluidsinstallatie", "piano"] },
      { floorId: sh0.id, name: "Ontvangsthal", code: "SH-0.03", functionType: "ontvangst", areaM2: 220, areaVvoM2: 205, areaBvoM2: 255, department: "Receptie", floorFinish: "natuursteen", capacity: null, bookable: false, facilities: ["receptiebalie"] },
      { floorId: sh1.id, name: "Vergaderzaal De Rijn", code: "SH-1.04", functionType: "vergaderruimte", areaM2: 42, areaVvoM2: 40, areaBvoM2: 48, department: "Bestuur", floorFinish: "tapijt", capacity: 12, bookable: true, facilities: ["scherm", "videobellen", "whiteboard"] },
      { floorId: sh1.id, name: "Vergaderzaal De Waal", code: "SH-1.05", functionType: "vergaderruimte", areaM2: 28, areaVvoM2: 26, areaBvoM2: 32, department: "Bestuur", floorFinish: "tapijt", capacity: 8, bookable: true, facilities: ["scherm", "whiteboard"] },
      { floorId: sh1.id, name: "B&W-kamer", code: "SH-1.06", functionType: "vergaderruimte", areaM2: 55, areaVvoM2: 52, areaBvoM2: 63, department: "Bestuur", floorFinish: "tapijt", capacity: 14, bookable: false, facilities: ["scherm", "videobellen"] },
      { floorId: sh2.id, name: "Focusruimte De Lek", code: "SH-2.07", functionType: "focusruimte", areaM2: 9, areaVvoM2: 8.5, areaBvoM2: 10.5, department: "Ruimtelijke Ordening", floorFinish: "tapijt", capacity: 2, bookable: true, facilities: ["scherm"] },
      { floorId: sh2.id, name: "Kantoortuin Zuid", code: "SH-2.08", functionType: "kantoortuin", areaM2: 310, areaVvoM2: 295, areaBvoM2: 355, department: "Ruimtelijke Ordening", floorFinish: "tapijt", capacity: 48, bookable: false, facilities: [] },
      { floorId: sk0.id, name: "Bedrijfsrestaurant", code: "SK-0.01", functionType: "restaurant", areaM2: 260, areaVvoM2: 245, areaBvoM2: 300, department: "Catering", floorFinish: "pvc", capacity: 120, bookable: false, facilities: ["uitgiftebalie", "koffiecorner"] },
      { floorId: sk0.id, name: "Vergaderzaal De Maas", code: "SK-0.02", functionType: "vergaderruimte", areaM2: 36, areaVvoM2: 34, areaBvoM2: 41, department: "Financiën", floorFinish: "pvc", capacity: 10, bookable: true, facilities: ["scherm", "videobellen"] },
      { floorId: sk1.id, name: "Vergaderzaal De IJssel", code: "SK-1.03", functionType: "vergaderruimte", areaM2: 24, areaVvoM2: 22.5, areaBvoM2: 28, department: "Financiën", floorFinish: "tapijt", capacity: 6, bookable: true, facilities: ["scherm"] },
      { floorId: sk1.id, name: "Kantoortuin Noord", code: "SK-1.04", functionType: "kantoortuin", areaM2: 280, areaVvoM2: 265, areaBvoM2: 320, department: "Financiën", floorFinish: "tapijt", capacity: 40, bookable: false, facilities: [] },
      { floorId: wf0.id, name: "Werkplaats", code: "GW-0.01", functionType: "werkplaats", areaM2: 450, areaVvoM2: 430, areaBvoM2: 505, department: "Facilitair Bedrijf", floorFinish: "beton", capacity: null, bookable: false, facilities: ["hefbrug", "gereedschap"] },
      { floorId: wf0.id, name: "Kantine Werf", code: "GW-0.02", functionType: "kantine", areaM2: 60, areaVvoM2: 56, areaBvoM2: 70, department: "Facilitair Bedrijf", floorFinish: "pvc", capacity: 24, bookable: false, facilities: ["koffiecorner"] },
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

  // Leveranciers & contracten
  const suppliers = await db
    .insert(suppliersTable)
    .values([
      { name: "Techniek Partners B.V.", category: "techniek", contactName: "Kees Mulder", email: "info@techniekpartners.nl", phone: "010-1234567", kvkNumber: "24123456", userId: u("kees").id },
      { name: "CleanCare Facilitair", category: "schoonmaak", contactName: "Miriam de Groot", email: "planning@cleancare.nl", phone: "010-2345678", kvkNumber: "24234567", userId: null },
      { name: "GroenWerk Rijnstad", category: "groenvoorziening", contactName: "Bram Verhoef", email: "bram@groenwerk.nl", phone: "010-3456789", kvkNumber: "24345678", userId: null },
      { name: "SecuriTop Beveiliging", category: "beveiliging", contactName: "Ilse Kuijpers", email: "contract@securitop.nl", phone: "010-4567890", kvkNumber: "24456789", userId: null },
      { name: "Van Vliet Catering", category: "catering", contactName: "Joost van Vliet", email: "offerte@vanvlietcatering.nl", phone: "010-5678901", kvkNumber: "24567890", userId: null },
    ])
    .returning();
  const sup = (name: string) => suppliers.find((s) => s.name.startsWith(name))!;

  const contracts = await db.insert(contractsTable).values([
    { name: "Onderhoud klimaatinstallaties", supplierId: sup("Techniek").id, category: "techniek", description: "Preventief en correctief onderhoud aan alle klimaatinstallaties.", startDate: today(-700), endDate: today(45), noticePeriodDays: 90, annualValue: 48500, status: "actief", ownerId: u("fatima").id },
    { name: "Schoonmaak kantoorpanden", supplierId: sup("CleanCare").id, category: "schoonmaak", description: "Dagelijkse schoonmaak Stadhuis en Stadskantoor.", startDate: today(-400), endDate: today(330), noticePeriodDays: 180, annualValue: 132000, status: "actief", ownerId: u("fatima").id },
    { name: "Groenonderhoud buitenterreinen", supplierId: sup("GroenWerk").id, category: "groenvoorziening", description: "Onderhoud groen rondom alle vestigingen.", startDate: today(-250), endDate: today(480), noticePeriodDays: 90, annualValue: 27500, status: "actief", ownerId: u("ruben").id },
    { name: "Beveiligingsdiensten avond/nacht", supplierId: sup("SecuriTop").id, category: "beveiliging", description: "Surveillance en alarmopvolging.", startDate: today(-900), endDate: today(70), noticePeriodDays: 120, annualValue: 89000, status: "actief", ownerId: u("ruben").id },
    { name: "Banqueting raadsvergaderingen", supplierId: sup("Van Vliet").id, category: "catering", description: "Catering bij raads- en commissievergaderingen.", startDate: today(-1100), endDate: today(-30), noticePeriodDays: 60, annualValue: 18000, status: "verlopen", ownerId: u("fatima").id },
    { name: "Liftonderhoud Stadhuis", supplierId: sup("Techniek").id, category: "techniek", description: "Jaarlijkse keuring en onderhoud liften.", startDate: today(-500), endDate: today(600), noticePeriodDays: 90, annualValue: 12400, status: "actief", ownerId: u("fatima").id },
  ]).returning();
  const ctr = (name: string) => contracts.find((c) => c.name.startsWith(name))!;

  // Voorbeelddocumenten in de digitale kluis (objectPath is placeholder — geen echte storage-objecten in seed)
  await db.insert(contractDocumentsTable).values([
    { contractId: ctr("Onderhoud klimaat").id, fileName: "Offerte_Techniek_Partners_2024.pdf", objectPath: "/objects/uploads/seed-doc-001", uploadedById: u("fatima").id },
    { contractId: ctr("Onderhoud klimaat").id, fileName: "Getekend_contract_klimaat_2022.pdf", objectPath: "/objects/uploads/seed-doc-002", uploadedById: u("fatima").id },
    { contractId: ctr("Schoonmaak").id, fileName: "SLA_schoonmaak_bijlage_A.pdf", objectPath: "/objects/uploads/seed-doc-003", uploadedById: u("ruben").id },
    { contractId: ctr("Liftonderhoud").id, fileName: "Keuringsrapport_liften_2025.pdf", objectPath: "/objects/uploads/seed-doc-004", uploadedById: u("fatima").id },
  ]);

  // Leveranciersbeoordelingen (meerdere jaren voor Techniek Partners)
  await db.insert(supplierReviewsTable).values([
    { supplierId: sup("Techniek").id, reviewerId: u("fatima").id, year: 2024, score: 4, comment: "Goede responstijd en vakkundige monteurs. Facturering soms vertraagd." },
    { supplierId: sup("Techniek").id, reviewerId: u("ruben").id, year: 2025, score: 5, comment: "Uitstekend jaar. Alle SLA-doelen gehaald, proactieve communicatie." },
    { supplierId: sup("CleanCare").id, reviewerId: u("fatima").id, year: 2025, score: 3, comment: "Wisselende kwaliteit. Herhaaldelijk moeten bijsturen op de werf." },
    { supplierId: sup("GroenWerk").id, reviewerId: u("ruben").id, year: 2025, score: 4, comment: "Betrouwbaar en flexibel bij extra opdrachten." },
    { supplierId: sup("SecuriTop").id, reviewerId: u("ruben").id, year: 2025, score: 4, comment: "Professionele dienstverlening, nul incidenten." },
    { supplierId: sup("Van Vliet").id, reviewerId: u("fatima").id, year: 2024, score: 2, comment: "Te veel fouten in bestellingen en late leveringen. Contract niet verlengd." },
  ]);

  // Webshop: producten, budgetten, bestellingen
  // Goedkeuringsdrempel: bestellingen t/m €50 worden automatisch goedgekeurd
  await db.insert(approvalThresholdTable).values([{ thresholdAmount: 50 }]);

  const products = await db
    .insert(shopProductsTable)
    .values([
      { name: "Kopieerpapier A4 (doos)", description: "5x500 vel, 80 grams", category: "kantoorartikelen", price: 24.95, unit: "doos", stock: 42, minStock: 20, supplierId: null },
      { name: "Balpennen blauw (50 st.)", description: "Doos met 50 stuks", category: "kantoorartikelen", price: 17.5, unit: "doos", stock: 8, minStock: 10, supplierId: null },
      { name: "Whiteboardmarkers (set)", description: "Set van 4 kleuren", category: "kantoorartikelen", price: 6.75, unit: "set", stock: 31, minStock: 15, supplierId: null },
      { name: "USB-C dockingstation", description: "Dual monitor, 100W PD", category: "ict", price: 189.0, unit: "stuk", stock: 6, minStock: 4, supplierId: sup("Techniek").id },
      { name: "Draadloze muis", description: "Ergonomisch, stil klikgeluid", category: "ict", price: 34.5, unit: "stuk", stock: 14, minStock: 8, supplierId: sup("Techniek").id },
      { name: "Headset met microfoon", description: "Voor videobellen, USB", category: "ict", price: 59.95, unit: "stuk", stock: 3, minStock: 6, supplierId: sup("Techniek").id },
      { name: "Bureaustoel ergonomisch", description: "NEN-EN 1335 gecertificeerd", category: "meubilair", price: 425.0, unit: "stuk", stock: 5, minStock: 2, supplierId: null },
      { name: "Monitorarm enkel", description: "Gasveer, VESA 75/100", category: "meubilair", price: 89.0, unit: "stuk", stock: 12, minStock: 5, supplierId: null },
      { name: "Koffiebekers composteerbaar (1000 st.)", description: "180 ml, PLA-coating", category: "facilitair", price: 42.0, unit: "doos", stock: 18, minStock: 10, supplierId: sup("Van Vliet").id },
      { name: "Handzeep navulling (6L)", description: "Dermatologisch getest", category: "facilitair", price: 28.5, unit: "can", stock: 9, minStock: 12, supplierId: sup("Van Vliet").id },
    ])
    .returning();
  const prod = (name: string) => products.find((p) => p.name.startsWith(name))!;

  await db.insert(budgetsTable).values([
    { department: "Burgerzaken", year: 2026, amount: 7500 },
    { department: "Ruimtelijke Ordening", year: 2026, amount: 6000 },
    { department: "Financiën", year: 2026, amount: 5000 },
    { department: "Facilitair Bedrijf", year: 2026, amount: 15000 },
    { department: "Receptie", year: 2026, amount: 2500 },
    { department: "Catering", year: 2026, amount: 4000 },
  ]);

  const orders = await db
    .insert(shopOrdersTable)
    .values([
      { number: "WS-2026-1001", requesterId: u("emma").id, department: "Burgerzaken", status: "geleverd", totalAmount: 124.75, approverId: u("fatima").id, decidedAt: hoursAgo(300), createdAt: hoursAgo(340) },
      { number: "WS-2026-1002", requesterId: u("daan").id, department: "Financiën", status: "goedgekeurd", totalAmount: 378.0, approverId: u("fatima").id, decidedAt: hoursAgo(20), createdAt: hoursAgo(30), supplierId: sup("Techniek").id, supplierStatus: "verstuurd", sentToSupplierAt: hoursAgo(10) },
      { number: "WS-2026-1003", requesterId: u("noor").id, department: "Ruimtelijke Ordening", status: "ingediend", totalAmount: 484.95, createdAt: hoursAgo(4) },
      { number: "WS-2026-1004", requesterId: u("linda").id, department: "Receptie", status: "afgekeurd", totalAmount: 850.0, approverId: u("fatima").id, decisionNote: "Boven budget; graag eerst afstemmen met inkoop.", decidedAt: hoursAgo(70), createdAt: hoursAgo(90) },
      { number: "WS-2026-1005", requesterId: u("emma").id, department: "Burgerzaken", status: "ingediend", totalAmount: 119.9, createdAt: hoursAgo(1) },
    ])
    .returning();
  await db.insert(shopOrderLinesTable).values([
    { orderId: orders[0]!.id, productId: prod("Kopieerpapier").id, quantity: 5, unitPrice: 24.95 },
    { orderId: orders[1]!.id, productId: prod("USB-C").id, quantity: 2, unitPrice: 189.0 },
    { orderId: orders[2]!.id, productId: prod("Bureaustoel").id, quantity: 1, unitPrice: 425.0 },
    { orderId: orders[2]!.id, productId: prod("Draadloze muis").id, quantity: 1, unitPrice: 34.5 },
    { orderId: orders[3]!.id, productId: prod("Bureaustoel").id, quantity: 2, unitPrice: 425.0 },
    { orderId: orders[4]!.id, productId: prod("Headset").id, quantity: 2, unitPrice: 59.95 },
  ]);

  // Duurzaamheid: meterstanden (cumulatief, maandelijks) en afvalregistraties
  const meterRows: {
    buildingId: number; meterType: string; readingDate: string; value: number; unit: string; source: string; registeredById: number;
  }[] = [];
  const buildingsForMeters = [
    { b: stadhuis!, elek: 184000, gas: 42100, water: 6100, elekStep: [5200, 4900, 4600, 4300, 4100, 4400], gasStep: [900, 720, 480, 260, 140, 90], waterStep: [120, 115, 130, 125, 140, 135] },
    { b: stadskantoor!, elek: 121500, gas: 28800, water: 4200, elekStep: [3600, 3400, 3200, 3000, 2900, 3100], gasStep: [640, 500, 330, 180, 90, 60], waterStep: [95, 90, 100, 98, 108, 104] },
  ];
  for (const cfg of buildingsForMeters) {
    let e = cfg.elek, g = cfg.gas, w = cfg.water;
    for (let m = 0; m < 7; m++) {
      const d = new Date(2026, 1 + m, 1); // feb..aug 2026
      const dateStr = d.toLocaleDateString("sv-SE");
      meterRows.push({ buildingId: cfg.b.id, meterType: "elektriciteit", readingDate: dateStr, value: e, unit: "kWh", source: m < 5 ? "csv_import" : "handmatig", registeredById: u("ruben").id });
      meterRows.push({ buildingId: cfg.b.id, meterType: "gas", readingDate: dateStr, value: g, unit: "m3", source: m < 5 ? "csv_import" : "handmatig", registeredById: u("ruben").id });
      meterRows.push({ buildingId: cfg.b.id, meterType: "water", readingDate: dateStr, value: w, unit: "m3", source: "handmatig", registeredById: u("fatima").id });
      if (m < 6) { e += cfg.elekStep[m]!; g += cfg.gasStep[m]!; w += cfg.waterStep[m]!; }
    }
  }
  await db.insert(meterReadingsTable).values(meterRows);

  const wasteRows: { buildingId: number; registrationDate: string; category: string; weightKg: number; registeredById: number }[] = [];
  const wasteCfg: [string, number[]][] = [
    ["restafval", [520, 480, 510, 495, 530, 505]],
    ["papier", [310, 290, 305, 280, 300, 295]],
    ["gft", [140, 150, 160, 175, 180, 170]],
    ["plastic", [95, 100, 92, 105, 110, 98]],
    ["glas", [40, 35, 45, 38, 42, 44]],
  ];
  for (let m = 0; m < 6; m++) {
    const d = new Date(2026, 2 + m, 15); // mrt..aug 2026
    const dateStr = d.toLocaleDateString("sv-SE");
    for (const [category, weights] of wasteCfg) {
      wasteRows.push({ buildingId: stadhuis!.id, registrationDate: dateStr, category, weightKg: weights[m]!, registeredById: u("fatima").id });
      wasteRows.push({ buildingId: stadskantoor!.id, registrationDate: dateStr, category, weightKg: Math.round(weights[m]! * 0.7), registeredById: u("fatima").id });
    }
  }
  await db.insert(wasteRegistrationsTable).values(wasteRows);

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

  // MJOP: bouwdelen gekoppeld aan de gebouwstructuur
  const bouwdelen = await db
    .insert(bouwdelenTable)
    .values([
      { code: "BD-DAK-001", name: "Bitumen dakbedekking Stadhuis", category: "dak", nlSfbCode: "(17)", buildingId: stadhuis!.id, floorId: null, roomId: null, material: "bitumen", installYear: 2004, expectedLifespanYears: 25, replacementCost: 185000, notes: "Laatste renovatie 2004, plaatselijke blaasvorming." },
      { code: "BD-GEV-001", name: "Kozijnen voorgevel Stadhuis", category: "gevel", nlSfbCode: "(31)", buildingId: stadhuis!.id, floorId: null, roomId: null, material: "hardhout", installYear: 1998, expectedLifespanYears: 40, replacementCost: 240000, notes: "Monumentale gevel, schilderwerk cyclus 6 jaar." },
      { code: "BD-INS-001", name: "Klimaatinstallatie Stadhuis", category: "installaties", nlSfbCode: "(45)", buildingId: stadhuis!.id, floorId: null, roomId: null, material: "VRV-systeem", installYear: 2019, expectedLifespanYears: 15, replacementCost: 320000, notes: null },
      { code: "BD-INS-002", name: "Liftinstallatie Stadhuis", category: "transport", nlSfbCode: "(52)", buildingId: stadhuis!.id, floorId: sh0.id, roomId: null, material: "staal", installYear: 2010, expectedLifespanYears: 25, replacementCost: 95000, notes: "Jaarlijkse keuring verplicht." },
      { code: "BD-INT-001", name: "Parketvloer Raadzaal", category: "interieur", nlSfbCode: "(21)", buildingId: stadhuis!.id, floorId: sh0.id, roomId: room("SH-0.01").id, material: "eiken parket", installYear: 2012, expectedLifespanYears: 30, replacementCost: 48000, notes: null },
      { code: "BD-DAK-002", name: "Dakbedekking Stadskantoor", category: "dak", nlSfbCode: "(17)", buildingId: stadskantoor!.id, floorId: null, roomId: null, material: "EPDM", installYear: 2016, expectedLifespanYears: 30, replacementCost: 130000, notes: null },
      { code: "BD-INS-003", name: "Verwarmingsketels Stadskantoor", category: "installaties", nlSfbCode: "(42)", buildingId: stadskantoor!.id, floorId: null, roomId: null, material: "HR-ketels", installYear: 2011, expectedLifespanYears: 18, replacementCost: 75000, notes: "Vervanging door warmtepomp overwegen." },
      { code: "BD-GEV-002", name: "Overheaddeuren Gemeentewerf", category: "gevel", nlSfbCode: "(33)", buildingId: werf!.id, floorId: wf0.id, roomId: room("GW-0.01").id, material: "staal", installYear: 2008, expectedLifespanYears: 25, replacementCost: 42000, notes: null },
    ])
    .returning();
  const bd = (code: string) => bouwdelen.find((b) => b.code === code)!;

  await db.insert(conditiemetingenTable).values([
    { bouwdeelId: bd("BD-DAK-001").id, inspectorId: u("ruben").id, score: 4, scoreAfgeleid: 4, scoreOverride: null, toelichting: "Dakbedekking toont veroudering; einde levensduur nadert.", gebreken: [
      { description: "Blaasvorming in bitumen aan zuidzijde", ernst: "serieus", omvang: "10-30%", intensiteit: "hoog", photoPath: null },
      { description: "Craquelé rond dakdoorvoeren", ernst: "licht", omvang: "2-10%", intensiteit: "laag", photoPath: null },
    ], measuredAt: hoursAgo(24 * 45) },
    { bouwdeelId: bd("BD-DAK-001").id, inspectorId: u("ruben").id, score: 3, scoreAfgeleid: null, scoreOverride: 3, toelichting: "Reguliere inspectie, plaatselijke gebreken hersteld.", gebreken: [], measuredAt: hoursAgo(24 * 400) },
    { bouwdeelId: bd("BD-GEV-001").id, inspectorId: u("fatima").id, score: 3, scoreAfgeleid: 3, scoreOverride: null, toelichting: "Schilderwerk verweerd, houtrot beperkt.", gebreken: [
      { description: "Houtrot in onderdorpel raadzaalzijde", ernst: "serieus", omvang: "< 2%", intensiteit: "midden", photoPath: null },
    ], measuredAt: hoursAgo(24 * 60) },
    { bouwdeelId: bd("BD-INS-001").id, inspectorId: u("ruben").id, score: 2, scoreAfgeleid: null, scoreOverride: 2, toelichting: "Installatie in goede conditie, filters vervangen.", gebreken: [], measuredAt: hoursAgo(24 * 20) },
    { bouwdeelId: bd("BD-INS-003").id, inspectorId: u("ruben").id, score: 4, scoreAfgeleid: 4, scoreOverride: null, toelichting: "Ketels naderen einde levensduur, rendement loopt terug.", gebreken: [
      { description: "Corrosie aan rookgasafvoer ketel 2", ernst: "ernstig", omvang: "2-10%", intensiteit: "hoog", photoPath: null },
    ], measuredAt: hoursAgo(24 * 10) },
    { bouwdeelId: bd("BD-GEV-002").id, inspectorId: u("ruben").id, score: 5, scoreAfgeleid: 5, scoreOverride: null, toelichting: "Deuren zwaar belast, aandrijving storingsgevoelig.", gebreken: [
      { description: "Aandrijfmotor deur 2 hapert bij openen", ernst: "ernstig", omvang: "30-70%", intensiteit: "hoog", photoPath: null },
      { description: "Lakschade en roestvorming onderzijde", ernst: "serieus", omvang: "10-30%", intensiteit: "midden", photoPath: null },
    ], measuredAt: hoursAgo(24 * 5) },
  ]);

  const jaar = new Date().getFullYear();
  await db.insert(mjopTakenTable).values([
    { bouwdeelId: bd("BD-DAK-001").id, title: "Dakbedekking Stadhuis vervangen", description: "Volledige vervanging bitumen dakbedekking incl. isolatie-upgrade.", taskType: "vervanging", plannedYear: jaar + 3, estimatedCost: 185000, status: "gepland" },
    { bouwdeelId: bd("BD-DAK-001").id, title: "Noodreparatie blaasvorming dak", description: "Plaatselijk herstel blazen zuidzijde.", taskType: "onderhoud", plannedYear: jaar, estimatedCost: 8500, status: "gepland" },
    { bouwdeelId: bd("BD-GEV-001").id, title: "Schilderwerk kozijnen voorgevel", description: "Cyclisch schilderwerk en herstel houtrot.", taskType: "onderhoud", plannedYear: jaar + 1, estimatedCost: 36000, status: "gepland" },
    { bouwdeelId: bd("BD-INS-001").id, title: "Groot onderhoud klimaatinstallatie", description: "Compressoren reviseren en koudemiddel controleren.", taskType: "onderhoud", plannedYear: jaar + 2, estimatedCost: 22000, status: "gepland" },
    { bouwdeelId: bd("BD-INS-002").id, title: "Periodieke liftkeuring", description: "Wettelijke keuring en smering.", taskType: "inspectie", plannedYear: jaar, estimatedCost: 1800, status: "afgerond" },
    { bouwdeelId: bd("BD-INT-001").id, title: "Parket Raadzaal schuren en lakken", description: null, taskType: "onderhoud", plannedYear: jaar + 1, estimatedCost: 9500, status: "gepland" },
    { bouwdeelId: bd("BD-INS-003").id, title: "Vervanging ketels door warmtepomp", description: "Verduurzaming warmteopwekking Stadskantoor.", taskType: "renovatie", plannedYear: jaar + 2, estimatedCost: 145000, status: "gepland" },
    { bouwdeelId: bd("BD-INS-003").id, title: "Herstel rookgasafvoer ketel 2", description: "Corrosie verhelpen, urgent.", taskType: "onderhoud", plannedYear: jaar, estimatedCost: 4200, status: "gepland" },
    { bouwdeelId: bd("BD-GEV-002").id, title: "Revisie aandrijving overheaddeuren", description: "Motor deur 2 reviseren of vervangen.", taskType: "onderhoud", plannedYear: jaar, estimatedCost: 6800, status: "gepland" },
    { bouwdeelId: bd("BD-DAK-002").id, title: "Dakinspectie Stadskantoor", description: "Tweejaarlijkse conditiemeting EPDM-dak.", taskType: "inspectie", plannedYear: jaar + 1, estimatedCost: 1500, status: "gepland" },
  ]);

  // Kostenbibliotheek
  await db.insert(kostenKengetallenTable).values([
    { name: "Bitumen dakbedekking (enkellaags)", category: "dak", nlSfbCode: "(17)", unit: "m²", pricePerUnit: 85, notes: "Inclusief ondervloer en isolatie" },
    { name: "EPDM dakbedekking", category: "dak", nlSfbCode: "(17)", unit: "m²", pricePerUnit: 65, notes: "Exclusief isolatie" },
    { name: "Hardhout kozijnen incl. schilderwerk", category: "gevel", nlSfbCode: "(31)", unit: "m²", pricePerUnit: 950, notes: "Inclusief hang- en sluitwerk" },
    { name: "Stalen overheaddeur", category: "gevel", nlSfbCode: "(33)", unit: "stuk", pricePerUnit: 8500, notes: "Inclusief aandrijfmotor en installatie" },
    { name: "VRV-klimaatinstallatie (vervanging)", category: "installaties", nlSfbCode: "(45)", unit: "m²", pricePerUnit: 220, notes: "Kantoor/utiliteitsbouw, per bruto vloeroppervlak" },
    { name: "HR-ketel (tot 100 kW)", category: "installaties", nlSfbCode: "(42)", unit: "stuk", pricePerUnit: 4800, notes: "Inclusief installatie, exclusief leidingwerk" },
    { name: "Warmtepomp (lucht-water)", category: "installaties", nlSfbCode: "(42)", unit: "stuk", pricePerUnit: 18000, notes: "Inclusief installatie en inregeling" },
    { name: "Personenlift (traction, 8 personen)", category: "transport", nlSfbCode: "(52)", unit: "stuk", pricePerUnit: 95000, notes: "Incl. machinekamer en veiligheidskeuring" },
    { name: "Eiken parketvloer schuren en lakken", category: "interieur", nlSfbCode: "(21)", unit: "m²", pricePerUnit: 45, notes: "3-laags lakwerk, inclusief plinten" },
    { name: "Gevelbekleding (betonsteen)", category: "gevel", nlSfbCode: "(28)", unit: "m²", pricePerUnit: 180, notes: "Inclusief steigerkosten" },
  ]);

  // Scenarioplanning
  await db.insert(mjopScenariosTable).values([
    {
      name: "Alleen noodzakelijk",
      type: "noodzakelijk",
      description: "Vervanging alleen bij slechte conditie (score ≥ 5) of overschrijding nominale levensduur. Laagste budgetbeslag.",
      buildingId: null,
      isActive: true,
    },
    {
      name: "Instandhouding hoog niveau",
      type: "hoog",
      description: "Vervanging bij matige conditie (score ≥ 3) of op 80% van de levensduur. Hogere kosten, betere staat.",
      buildingId: null,
      isActive: false,
    },
  ]);

  // Knowledge articles
  await db.insert(knowledgeArticlesTable).values([
    { title: "Wat te doen bij een te warme of te koude werkplek?", body: "1. Controleer eerst of ramen en deuren gesloten zijn.\n2. Kijk of de thermostaat in de ruimte correct is ingesteld (ingestelde temperatuur: 20-22°C).\n3. Als het probleem aanhoudt, dien dan een melding in via 'Storing klimaat'.\n4. Bij spoedeisende situaties (>26°C of <16°C) geef dit aan in uw melding met prioriteit P1.", category: "klimaat", tags: ["temperatuur", "ventilatie", "klimaat", "warmte", "koude"] },
    { title: "Hoe een ruimte reserveren met catering?", body: "1. Ga naar 'Reserveringen' in het menu.\n2. Klik op 'Nieuwe reservering'.\n3. Kies de gewenste ruimte, datum en tijdstip.\n4. Stel eventueel de opbouw- en schoonmaakbuffer in (standaard 15 minuten).\n5. Voeg cateringartikelen toe via de knop 'Toevoegen' in de cateringsectie.\n6. Klik op 'Reserveren' om te bevestigen.\n\nDe cateraar ontvangt automatisch een melding van uw bestelling.", category: "reserveringen", tags: ["reservering", "catering", "ruimte", "boeken"] },
    { title: "Mijn wachtwoord vergeten \u2013 hoe resetten?", body: "Neem contact op met de servicedesk via een melding in het systeem (categorie 'Overig') of bel intern 4444. De servicedesk reset uw wachtwoord binnen één werkdag.", category: "algemeen", tags: ["wachtwoord", "login", "account", "reset"] },
    { title: "Kapotte verlichting melden", body: "Defecte of flikkerende verlichting meldt u via 'Meldingen > Nieuwe melding' met categorie 'Verlichting'.\n\nVermeld:\n- Het aantal defecte armaturen\n- De exacte locatie (ruimtecode)\n- Of de verlichting volledig uit is of flikkert\n\nDe servicedesk handelt dit af binnen 24 uur (P3).", category: "technisch", tags: ["verlichting", "armatuur", "lamp", "storing", "flikkeren"] },
    { title: "Werkplek boeken voor een dag", body: "1. Ga naar 'Werkplekken' in het menu.\n2. Kies de gewenste datum via de datumkiezer.\n3. Filter optioneel op verdieping.\n4. Klik op een beschikbare werkplek (groen bolletje = beschikbaar).\n5. De boeking wordt direct bevestigd.\n\nU kunt ook zoeken welke werkplek een collega heeft geboekt via de zoekbalk 'Zoek collega op naam'.", category: "reserveringen", tags: ["werkplek", "flexplek", "boeken", "collega", "boeking"] },
    { title: "Sanitair storing of verstopte afvoer melden", body: "Sanitaire problemen zoals verstoppingen, lekkages of defecte kranen meldt u via categorie 'Sanitair'.\n\nBij een actieve lekkage met wateroverlast: markeer dit als P1 (veiligheid) en neem telefonisch contact op met de servicedesk (intern 4444) voor directe actie.", category: "sanitair", tags: ["sanitair", "lekkage", "verstopping", "toilet", "kraan", "water"] },
    { title: "Hoe een bezoeker registreren?", body: "1. Ga naar 'Bezoekers' in het menu.\n2. Klik op 'Bezoeker registreren'.\n3. Vul de naam, het bedrijf en de verwachte aankomsttijd in.\n4. De receptie ontvangt automatisch een melding.\n5. Bij aankomst checkt de receptie de bezoeker in.\n\nBezoekers ontvangen bij registratie een digitale badgecode.", category: "algemeen", tags: ["bezoeker", "registratie", "badge", "receptie", "aanmelding"] },
    { title: "Schoonmaakprobleem of vervuiling melden", body: "Bij gemorste vloeistoffen, vuilnis of andere vervuiling:\n1. Maak een melding aan via categorie 'Schoonmaak'.\n2. Geef het type vervuiling aan en de exacte locatie.\n3. Als er gevaar is voor uitglijden, vink dan 'Direct gevaar' aan \u2013 dit verhoogt de prioriteit.\n\nBij ernstige situaties (grote lekkage, glasscherven) bel intern 4444.", category: "schoonmaak", tags: ["schoonmaak", "vervuiling", "gemorst", "vuilnis", "glasscherven"] },
  ]);

  // Sample satisfaction scores for closed tickets
  await db.insert(ticketSatisfactionTable).values([
    { ticketId: ticket("GC-2026-1008").id, score: 5, comment: "Snel opgelost, prima communicatie!", createdAt: hoursAgo(150) },
    { ticketId: ticket("GC-2026-1003").id, score: 4, comment: "Goed afgehandeld.", createdAt: hoursAgo(25) },
  ]);

  // Sleutel- en pasbeheer
  const seededKeys = await db
    .insert(keysTable)
    .values([
      { code: "SL-001", type: "sleutel", description: "Hoofdsleutel Stadhuis (loper)", buildingId: stadhuis!.id, status: "uitgegeven", replacementCost: 450 },
      { code: "SL-002", type: "sleutel", description: "Sleutel Raadzaal en Trouwzaal", buildingId: stadhuis!.id, status: "beschikbaar", replacementCost: 85 },
      { code: "SL-003", type: "sleutel", description: "Sleutel Werkplaats Gemeentewerf", buildingId: werf!.id, status: "uitgegeven", replacementCost: 120 },
      { code: "SL-004", type: "sleutel", description: "Sleutel serverruimte Stadskantoor", buildingId: stadskantoor!.id, status: "vermist", replacementCost: 275 },
      { code: "PAS-101", type: "pas", description: "Toegangspas alle publieksruimtes", buildingId: stadhuis!.id, status: "uitgegeven", replacementCost: 25 },
      { code: "PAS-102", type: "pas", description: "Toegangspas Stadskantoor kantooretages", buildingId: stadskantoor!.id, status: "beschikbaar", replacementCost: 25 },
      { code: "PAS-103", type: "pas", description: "Bezoekerspas receptie (leen)", buildingId: stadhuis!.id, status: "geblokkeerd", replacementCost: 25 },
    ])
    .returning();
  const key = (code: string) => seededKeys.find((k) => k.code === code)!;

  await db.insert(keyDoorsTable).values([
    { keyId: key("SL-001").id, description: "Cilinder C-01, hoofdingang Marktplein", roomId: room("SH-0.03").id },
    { keyId: key("SL-001").id, description: "Cilinder C-02, personeelsingang achterzijde", roomId: null },
    { keyId: key("SL-001").id, description: "Cilinder C-05, B&W-kamer", roomId: room("SH-1.06").id },
    { keyId: key("SL-002").id, description: "Cilinder C-03, Raadzaal", roomId: room("SH-0.01").id },
    { keyId: key("SL-002").id, description: "Cilinder C-04, Trouwzaal", roomId: room("SH-0.02").id },
    { keyId: key("SL-003").id, description: "Cilinder W-01, werkplaats roldeur", roomId: room("GW-0.01").id },
    { keyId: key("SL-004").id, description: "Cilinder S-01, serverruimte", roomId: null },
    { keyId: key("PAS-101").id, description: "Paslezer ontvangsthal", roomId: room("SH-0.03").id },
    { keyId: key("PAS-102").id, description: "Paslezer lift en trappenhuis Stadskantoor", roomId: null },
  ]);

  await db.insert(keyIssuesTable).values([
    { keyId: key("SL-001").id, holderId: u("ruben").id, issuedById: u("linda").id, issuedAt: hoursAgo(24 * 90), note: "Vaste loper beheerder" },
    { keyId: key("SL-003").id, holderId: u("kees").id, issuedById: u("linda").id, issuedAt: hoursAgo(24 * 14), note: "Onderhoudswerkzaamheden werf" },
    { keyId: key("PAS-101").id, holderId: u("emma").id, issuedById: u("linda").id, issuedAt: hoursAgo(24 * 30) },
    { keyId: key("SL-002").id, holderId: u("noor").id, issuedById: u("linda").id, issuedAt: hoursAgo(24 * 60), returnedAt: hoursAgo(24 * 40), note: "Tijdelijk voor raadsvergaderingen" },
    { keyId: key("SL-004").id, holderId: u("daan").id, issuedById: u("linda").id, issuedAt: hoursAgo(24 * 45), returnedAt: hoursAgo(24 * 10), note: "Uitgifte beëindigd via verliesprocedure" },
  ]);

  await db.insert(keyLossReportsTable).values([
    { keyId: key("SL-004").id, reportedById: u("linda").id, holderId: u("daan").id, chargeAmount: 275, note: "Sleutel verloren tijdens verhuizing; cilinder vervangen.", ticketId: null, createdAt: hoursAgo(24 * 10) },
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
