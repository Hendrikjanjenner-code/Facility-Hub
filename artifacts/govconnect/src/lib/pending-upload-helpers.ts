export interface PendingUpload {
  objectPath: string;
  contentType: string;
  sizeBytes: number;
  title: string;
  category: string;
}

/** Prefix voor de legacy geaggregeerde sleutel (één object per gebouw). */
export const LEGACY_KEY_PREFIX = "govconnect:pending-doc-";
/** Prefix voor de nieuwe per-upload sleutels (één sleutel per upload). */
export const ENTRY_KEY_PREFIX = "govconnect:pending-upload-";

/**
 * Bouw de localStorage-sleutel voor één specifieke upload.
 * Elke upload krijgt zijn eigen sleutel zodat gelijktijdige schrijfacties
 * vanuit meerdere tabbladen nooit elkaars data overschrijven.
 */
export function pendingUploadEntryKey(buildingId: number, objectPath: string): string {
  const safePath = objectPath.replace(/[^a-zA-Z0-9_\-./]/g, "_");
  return `${ENTRY_KEY_PREFIX}${buildingId}:${safePath}`;
}

/**
 * Sla één upload op onder zijn eigen localStorage-sleutel.
 * Twee tabbladen die tegelijk schrijven raken elkaars entry nooit kwijt
 * omdat elke upload (met een uniek objectPath) een unieke sleutel heeft.
 */
export function addPendingUpload(buildingId: number, entry: PendingUpload): void {
  try {
    localStorage.setItem(
      pendingUploadEntryKey(buildingId, entry.objectPath),
      JSON.stringify(entry),
    );
  } catch {
    // localStorage unavailable – silently skip
  }
}

/**
 * Geeft alle openstaande uploads terug voor dit gebouw.
 * Leest de nieuwe per-upload sleutels én de legacy geaggregeerde sleutel
 * (migratie: legacy entries worden naar de nieuwe structuur overgezet en verwijderd).
 */
export function getPendingUploads(buildingId: number): PendingUpload[] {
  const results: PendingUpload[] = [];
  try {
    const entryPrefix = `${ENTRY_KEY_PREFIX}${buildingId}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(entryPrefix)) continue;
      try {
        const raw = localStorage.getItem(key);
        if (raw) results.push(JSON.parse(raw) as PendingUpload);
      } catch {
        // corrupte entry – overslaan
      }
    }

    // Migreer de legacy geaggregeerde sleutel (geschreven door een oudere versie).
    const legacyKey = `${LEGACY_KEY_PREFIX}${buildingId}`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      try {
        const parsed: unknown = JSON.parse(legacyRaw);
        const legacyEntries: PendingUpload[] = Array.isArray(parsed)
          ? (parsed as PendingUpload[])
          : parsed && typeof parsed === "object" && "objectPath" in (parsed as object)
            ? [parsed as PendingUpload]
            : [];
        for (const e of legacyEntries) {
          addPendingUpload(buildingId, e);
          if (!results.some((r) => r.objectPath === e.objectPath)) {
            results.push(e);
          }
        }
      } catch {
        // corrupte legacy entry – verwijder hem gewoon
      }
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // localStorage niet beschikbaar
  }
  return results;
}

/** Verwijder de entry voor één specifiek upload-pad; andere uploads blijven intact. */
export function clearPendingUpload(buildingId: number, objectPath: string): void {
  try {
    localStorage.removeItem(pendingUploadEntryKey(buildingId, objectPath));
  } catch {
    // ignore
  }
}
