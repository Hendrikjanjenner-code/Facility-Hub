/**
 * Opruimroutine voor wees-uploads in object storage.
 *
 * Een wees-upload is een bestand dat wel in de uploads-map staat maar waarvoor
 * geen enkel DB-record verwijst én dat ouder is dan 24 uur.
 * Dit kan ontstaan als de upload slaagde maar het aanmaken van het document-record
 * mislukte (bv. door een netwerkfout of validatiefout in de front-end).
 *
 * Opgelet: de uploads-map bevat zowel gebouwdocumenten (buildingDocumentsTable)
 * als MJOP-inspectiefoto's (conditiemetingenTable.gebreken[].photoPath).
 * Beide worden als "referenced" beschouwd zodat actieve foto's nooit worden verwijderd.
 */

import { db, buildingDocumentsTable, conditiemetingenTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { logger } from "./logger";

const MAX_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000; // 24 uur

export async function cleanupOrphanedDocumentUploads(): Promise<void> {
  logger.info("Wees-upload opruimroutine gestart");

  const storageService = new ObjectStorageService();

  // Lijst alle bestanden op in de uploads-map.
  let uploadedObjects: Array<{ objectPath: string; timeCreated: Date | null }>;
  try {
    uploadedObjects = await storageService.listUploadObjects();
  } catch (err) {
    logger.warn({ err }, "Kon uploads niet ophalen uit storage; opruimroutine overgeslagen");
    return;
  }

  if (uploadedObjects.length === 0) {
    logger.info("Geen uploads gevonden; opruimroutine klaar");
    return;
  }

  // Haal alle objectpaden op die zijn geregistreerd als gebouwdocument.
  const docRefs = await db
    .select({ objectPath: buildingDocumentsTable.objectPath })
    .from(buildingDocumentsTable);

  // Haal alle photoPath-waarden op uit de MJOP-conditiemetingen (JSONB-array).
  // De SQL-functie jsonb_array_elements pakt elk gebrek-object uit de array;
  // ->> geeft de waarde als tekst.
  const mjopRefs = await db.execute<{ photo_path: string }>(
    sql`
      SELECT DISTINCT elem->>'photoPath' AS photo_path
      FROM ${conditiemetingenTable},
           jsonb_array_elements(${conditiemetingenTable.gebreken}) AS elem
      WHERE elem->>'photoPath' IS NOT NULL
        AND elem->>'photoPath' != ''
    `,
  );

  const referencedPaths = new Set<string>([
    ...docRefs.map((r) => r.objectPath),
    ...mjopRefs.rows.map((r) => r.photo_path),
  ]);

  const cutoff = new Date(Date.now() - MAX_UPLOAD_AGE_MS);
  let deleted = 0;
  let skipped = 0;

  for (const obj of uploadedObjects) {
    // Sla over als het bestand gekoppeld is aan een document of MJOP-foto.
    if (referencedPaths.has(obj.objectPath)) continue;

    // Sla over als het bestand jonger is dan de drempel (geeft de front-end
    // nog de kans om het document-record aan te maken).
    if (!obj.timeCreated || obj.timeCreated > cutoff) {
      skipped++;
      continue;
    }

    try {
      await storageService.deleteObject(obj.objectPath);
      logger.info({ objectPath: obj.objectPath }, "Wees-upload verwijderd");
      deleted++;
    } catch (err) {
      logger.warn({ err, objectPath: obj.objectPath }, "Kon wees-upload niet verwijderen");
    }
  }

  logger.info({ deleted, skipped }, "Wees-upload opruimroutine afgerond");
}
