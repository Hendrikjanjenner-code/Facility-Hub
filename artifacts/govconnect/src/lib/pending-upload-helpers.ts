export interface PendingUpload {
  objectPath: string;
  contentType: string;
  sizeBytes: number;
  title: string;
  category: string;
}

export function pendingUploadKey(buildingId: number): string {
  return `govconnect:pending-doc-${buildingId}`;
}

export function setPendingUpload(buildingId: number, entry: PendingUpload): void {
  try {
    localStorage.setItem(pendingUploadKey(buildingId), JSON.stringify(entry));
  } catch {
    // localStorage unavailable – silently skip
  }
}

export function getPendingUpload(buildingId: number): PendingUpload | null {
  try {
    const raw = localStorage.getItem(pendingUploadKey(buildingId));
    if (!raw) return null;
    return JSON.parse(raw) as PendingUpload;
  } catch {
    return null;
  }
}

export function clearPendingUpload(buildingId: number): void {
  try {
    localStorage.removeItem(pendingUploadKey(buildingId));
  } catch {
    // ignore
  }
}
