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
  getPendingUpload,
  clearPendingUpload,
} from "@/lib/pending-upload-helpers";

const API_BASE = "/api";

const DOC_CATEGORIES = [
  { value: "huurcontract", label: "Huurcontract" },
  { value: "bouwtekening", label: "Bouwtekening" },
  { value: "energielabel", label: "Energielabel" },
  { value: "overig", label: "Overig" },
] as const;

interface Props {
  buildingId: number;
  documents: Array<{ objectPath: string }> | undefined;
}

export function PendingUploadBanner({ buildingId, documents }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createDoc = useCreateBuildingDocument();

  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [retryTitle, setRetryTitle] = useState("");
  const [retryCategory, setRetryCategory] = useState("overig");
  const [retryOpen, setRetryOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Lees localStorage zodra de documentenlijst beschikbaar is.
  // Reset altijd de lokale state als buildingId verandert zodat de banner
  // nooit actief blijft voor een ander gebouw na client-side navigatie.
  useEffect(() => {
    if (!documents) return;
    const entry = getPendingUpload(buildingId);

    if (!entry) {
      setPending(null);
      setRetryTitle("");
      setRetryCategory("overig");
      setRetryOpen(false);
      setBusy(false);
      return;
    }

    // Controleer of het pad al geregistreerd is in de documentenlijst.
    const alreadySaved = documents.some((d) => d.objectPath === entry.objectPath);
    if (alreadySaved) {
      clearPendingUpload(buildingId);
      setPending(null);
      return;
    }

    // Pad staat in storage maar niet in de DB – toon de herstelknop.
    setPending(entry);
    setRetryTitle(entry.title);
    setRetryCategory(entry.category);
  }, [buildingId, documents]);

  if (!pending) return null;

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
    const deleted = await tryDeleteOrphan(pending.objectPath);
    if (deleted) {
      clearPendingUpload(buildingId);
      setPending(null);
      setRetryOpen(false);
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
          title: retryTitle.trim() || pending.title,
          category: retryCategory as (typeof DOC_CATEGORIES)[number]["value"],
          objectPath: pending.objectPath,
          contentType: pending.contentType,
          sizeBytes: pending.sizeBytes,
        },
      },
      {
        onSuccess: () => {
          clearPendingUpload(buildingId);
          queryClient.invalidateQueries({
            queryKey: getListBuildingDocumentsQueryKey(buildingId),
          });
          toast({ title: "Document alsnog opgeslagen" });
          setPending(null);
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
          Een eerdere upload (<strong>{pending.title || pending.objectPath}</strong>) is mogelijk
          niet opgeslagen omdat de verbinding wegviel.
        </span>
        {retryOpen ? (
          <div className="space-y-3 mt-1">
            <div className="space-y-1">
              <Label htmlFor="retry-title" className="text-xs">
                Titel
              </Label>
              <Input
                id="retry-title"
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
              <Button
                size="sm"
                onClick={handleRetry}
                disabled={busy || !retryTitle.trim()}
              >
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
