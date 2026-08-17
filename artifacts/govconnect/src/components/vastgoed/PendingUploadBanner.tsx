import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateBuildingDocument,
  getListBuildingDocumentsQueryKey,
} from "@workspace/api-client-react";
import { AlertCircle, RefreshCw } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  type PendingUpload,
  getPendingUploads,
  clearPendingUpload,
} from "@/lib/pending-upload-helpers";

const API_BASE = "/api";

const DOC_CATEGORIES = [
  { value: "huurcontract", label: "Huurcontract" },
  { value: "bouwtekening", label: "Bouwtekening" },
  { value: "energielabel", label: "Energielabel" },
  { value: "overig", label: "Overig" },
] as const;

// ---------------------------------------------------------------------------
// SinglePendingUploadBanner – handles one orphaned upload entry
// ---------------------------------------------------------------------------

function SinglePendingUploadBanner({
  buildingId,
  entry,
  onDone,
}: {
  buildingId: number;
  entry: PendingUpload;
  onDone: (objectPath: string) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createDoc = useCreateBuildingDocument();

  const [retryTitle, setRetryTitle] = useState(entry.title);
  const [retryCategory, setRetryCategory] = useState(entry.category);
  const [retryOpen, setRetryOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Geeft true terug als de DELETE 2xx antwoordde, anders false. */
  const tryDeleteOrphan = async (objectPath: string): Promise<boolean> => {
    const urlPath = objectPath.replace(/^\/objects\//, "");
    try {
      const resp = await fetch(`${API_BASE}/storage/objects/${urlPath}`, {
        method: "DELETE",
        credentials: "include",
      });
      return resp.ok;
    } catch {
      return false;
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    const deleted = await tryDeleteOrphan(entry.objectPath);
    if (deleted) {
      clearPendingUpload(buildingId, entry.objectPath);
      onDone(entry.objectPath);
    } else {
      toast({
        title: "Verwijderen mislukt",
        description:
          "Het bestand kon niet worden verwijderd. Controleer uw verbinding en probeer het opnieuw.",
        variant: "destructive",
      });
    }
    setBusy(false);
  };

  const handleRetry = () => {
    setBusy(true);
    createDoc.mutate(
      {
        id: buildingId,
        data: {
          title: retryTitle.trim() || entry.title,
          category: retryCategory as (typeof DOC_CATEGORIES)[number]["value"],
          objectPath: entry.objectPath,
          contentType: entry.contentType,
          sizeBytes: entry.sizeBytes,
        },
      },
      {
        onSuccess: () => {
          clearPendingUpload(buildingId, entry.objectPath);
          queryClient.invalidateQueries({
            queryKey: getListBuildingDocumentsQueryKey(buildingId),
          });
          toast({ title: "Document alsnog opgeslagen" });
          onDone(entry.objectPath);
          setRetryOpen(false);
        },
        onError: () => {
          toast({
            title: "Opslaan mislukt – probeer het opnieuw",
            variant: "destructive",
          });
        },
        onSettled: () => setBusy(false),
      },
    );
  };

  return (
    <Alert variant="destructive" className="mb-4" data-testid="pending-upload-banner">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex flex-col gap-2">
        <span>
          Een eerdere upload (<strong>{entry.title || entry.objectPath}</strong>) is mogelijk niet
          opgeslagen omdat de verbinding wegviel.
        </span>
        {retryOpen ? (
          <div className="space-y-3 mt-1">
            <div className="space-y-1">
              <Label htmlFor={`retry-title-${entry.objectPath}`} className="text-xs">
                Titel
              </Label>
              <Input
                id={`retry-title-${entry.objectPath}`}
                value={retryTitle}
                onChange={(e) => setRetryTitle(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categorie</Label>
              <Select value={retryCategory} onValueChange={setRetryCategory}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleRetry} disabled={busy || !retryTitle.trim()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {busy ? "Bezig…" : "Alsnog opslaan"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRetryOpen(false)}
                disabled={busy}
              >
                Terug
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                disabled={busy}
                className="ml-auto text-destructive-foreground/70"
              >
                Verwijderen
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setRetryOpen(true)}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Opnieuw proberen
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
              className="text-destructive-foreground/70"
            >
              Verwijderen &amp; negeren
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// PendingUploadBanner – renders one banner per orphaned upload
// ---------------------------------------------------------------------------

interface Props {
  buildingId: number;
  documents: Array<{ objectPath: string }> | undefined;
}

/**
 * Toont één banner per openstaande upload voor dit gebouw.
 * Meerdere uploads (bijv. vanuit twee tabs tegelijk) worden elk apart getoond.
 * Clearing één entry laat andere entries intact.
 */
export function PendingUploadBanner({ buildingId, documents }: Props) {
  const [pendingEntries, setPendingEntries] = useState<PendingUpload[]>([]);

  // Lees localStorage zodra de documentenlijst beschikbaar is.
  // Reset altijd als buildingId verandert zodat er geen stale state achterblijft.
  useEffect(() => {
    if (!documents) return;

    const all = getPendingUploads(buildingId);
    const savedPaths = new Set(documents.map((d) => d.objectPath));

    // Wis automatisch entries die al opgeslagen zijn (bijv. door een andere tab).
    const orphaned: PendingUpload[] = [];
    for (const entry of all) {
      if (savedPaths.has(entry.objectPath)) {
        clearPendingUpload(buildingId, entry.objectPath);
      } else {
        orphaned.push(entry);
      }
    }

    setPendingEntries(orphaned);
  }, [buildingId, documents]);

  if (pendingEntries.length === 0) return null;

  const handleDone = (objectPath: string) => {
    setPendingEntries((prev) => prev.filter((e) => e.objectPath !== objectPath));
  };

  return (
    <>
      {pendingEntries.map((entry) => (
        <SinglePendingUploadBanner
          key={entry.objectPath}
          buildingId={buildingId}
          entry={entry}
          onDone={handleDone}
        />
      ))}
    </>
  );
}
