/**
 * Centralised check: is an objectPath still referenced by any DB record?
 *
 * Tables checked:
 *   - buildingDocumentsTable   (vastgoed document uploads)
 *   - contractDocumentsTable   (digitale kluis)
 *   - conditiemetingenTable    (MJOP inspectiefoto's, JSONB array)
 *
 * Add new tables here whenever a new storage-backed entity is introduced.
 */

import { db, buildingDocumentsTable, contractDocumentsTable, conditiemetingenTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";

export async function isObjectPathReferenced(objectPath: string): Promise<boolean> {
  // Building documents
  const [buildingRef] = await db
    .select({ id: buildingDocumentsTable.id })
    .from(buildingDocumentsTable)
    .where(eq(buildingDocumentsTable.objectPath, objectPath))
    .limit(1);
  if (buildingRef) return true;

  // Contract documents (digitale kluis)
  const [contractRef] = await db
    .select({ id: contractDocumentsTable.id })
    .from(contractDocumentsTable)
    .where(eq(contractDocumentsTable.objectPath, objectPath))
    .limit(1);
  if (contractRef) return true;

  // MJOP inspection photos (embedded in JSONB array)
  const mjopRef = await db.execute<{ found: boolean }>(
    sql`
      SELECT EXISTS (
        SELECT 1
        FROM ${conditiemetingenTable},
             jsonb_array_elements(${conditiemetingenTable.gebreken}) AS elem
        WHERE elem->>'photoPath' = ${objectPath}
      ) AS found
    `,
  );
  if (mjopRef.rows[0]?.found) return true;

  return false;
}
