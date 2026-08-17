import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBuilding,
  useGetFloorPlan,
  useListBuildingDocuments,
  useCreateBuildingDocument,
  useDeleteBuildingDocument,
  useGetCurrentUser,
  useUpdateRoomDossier,
  getGetBuildingQueryKey,
  getGetFloorPlanQueryKey,
  getListBuildingDocumentsQueryKey,
  type FloorPlanRoom,
} from "@workspace/api-client-react";
import {
  AlertCircle,
  ArrowLeft,
  Building,
  FileText,
  Layers,
  MapPin,
  Trash2,
  Upload,
  Download,
  LayoutGrid,
  Pencil,
  ExternalLink,
  Users,
  Maximize2,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const API_BASE = "/api";

const DOC_CATEGORIES = [
  { value: "huurcontract", label: "Huurcontract" },
  { value: "bouwtekening", label: "Bouwtekening" },
  { value: "energielabel", label: "Energielabel" },
  { value: "overig", label: "Overig" },
] as const;

const docCategoryLabel = (v: string) => DOC_CATEGORIES.find((c) => c.value === v)?.label ?? v;

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} kB`;
  return `${n} B`;
}

function UploadDocumentDialog({ buildingId }: { buildingId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("overig");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Tracks the objectPath after a successful storage upload so we can retry
  // saving the document record without re-uploading the file.
  const [pendingObjectPath, setPendingObjectPath] = useState<string | null>(null);
  const [pendingMeta, setPendingMeta] = useState<{ contentType: string; sizeBytes: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const createDoc = useCreateBuildingDocument();

  const reset = () => {
    setTitle("");
    setCategory("overig");
    setFile(null);
    setPendingObjectPath(null);
    setPendingMeta(null);
    setSaveError(null);
  };

  /** Verwijder een wees-object uit storage (best-effort, fouten worden genegeerd).
   *  Wordt alleen aangeroepen als de gebruiker de dialog annuleert terwijl er
   *  een geüpload bestand is waarvan het record niet is aangemaakt. */
  const tryDeleteOrphan = async (objectPath: string) => {
    // objectPath is bijv. "/objects/uploads/abc123.pdf"
    const urlPath = objectPath.replace(/^\/objects\//, "");
    try {
      await fetch(`${API_BASE}/storage/objects/${urlPath}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // Best-effort; de periodieke wees-opruimroutine ruimt het na 24 uur op.
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v && pendingObjectPath && saveError) {
      // Gebruiker sluit de dialog terwijl het bestand al geüpload is maar het
      // record aanmaken mislukte. Ruim het wees-object op.
      void tryDeleteOrphan(pendingObjectPath);
    }
    setOpen(v);
    if (!v) reset();
  };

  /** Sla het document-record op in de database. Kan worden aangeroepen met een
   *  al geüpload objectPath (retry) of na een nieuwe upload. */
  const saveDocRecord = (objectPath: string, meta: { contentType: string; sizeBytes: number }) => {
    setSaveError(null);
    createDoc.mutate(
      {
        id: buildingId,
        data: {
          title: title.trim(),
          category: category as (typeof DOC_CATEGORIES)[number]["value"],
          objectPath,
          contentType: meta.contentType,
          sizeBytes: meta.sizeBytes,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBuildingDocumentsQueryKey(buildingId) });
          toast({ title: "Document toegevoegd" });
          reset();
          setOpen(false);
        },
        onError: () => {
          // Het bestand staat nog in storage maar het record is niet aangemaakt.
          // Bewaar pendingObjectPath zodat de gebruiker het opslaan kan herhalen
          // zonder het bestand opnieuw te hoeven uploaden.
          setSaveError(
            "Het bestand is geüpload maar kon niet worden opgeslagen. " +
            "Controleer uw verbinding en probeer het opnieuw.",
          );
          setUploading(false);
        },
        onSettled: () => setUploading(false),
      },
    );
  };

  const submit = async () => {
    if (!title.trim()) {
      toast({ title: "Vul een titel in", variant: "destructive" });
      return;
    }

    // Retry-pad: bestand is al geüpload, alleen het opslaan opnieuw proberen.
    if (pendingObjectPath && pendingMeta) {
      setUploading(true);
      saveDocRecord(pendingObjectPath, pendingMeta);
      return;
    }

    if (!file) {
      toast({ title: "Kies een bestand", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "Bestand is te groot (max 15 MB)", variant: "destructive" });
      return;
    }

    setUploading(true);
    setSaveError(null);
    try {
      const resp = await fetch(`${API_BASE}/storage/document-uploads`, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
        credentials: "include",
      });
      if (!resp.ok) {
        const err = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Upload mislukt");
      }
      const { objectPath } = (await resp.json()) as { objectPath: string };
      const meta = { contentType: file.type || "application/octet-stream", sizeBytes: file.size };

      // Bewaar het pad zodat we het opslaan kunnen herhalen zonder opnieuw te uploaden.
      setPendingObjectPath(objectPath);
      setPendingMeta(meta);

      saveDocRecord(objectPath, meta);
    } catch (e) {
      setUploading(false);
      toast({ title: e instanceof Error ? e.message : "Upload mislukt", variant: "destructive" });
    }
  };

  // Retry-modus: bestand is al in storage, alleen het opslaan mislukte.
  const isRetryMode = Boolean(pendingObjectPath && saveError);
  const isBusy = uploading || createDoc.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Document uploaden
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gebouwdocument uploaden</DialogTitle>
          <DialogDescription>PDF of afbeelding, maximaal 15 MB.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {saveError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="doc-title">Titel</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Huurcontract 2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Categorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* In retry-modus is het bestand al geüpload; geen nieuw bestand nodig. */}
          {!isRetryMode && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-file">Bestand</Label>
              <Input id="doc-file" type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={isBusy}>
            {isBusy ? "Bezig..." : isRetryMode ? "Opnieuw proberen" : "Uploaden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Kleurenpalet voor het vlekkenplan
const PALETTE = [
  "bg-blue-200 border-blue-400 text-blue-900",
  "bg-emerald-200 border-emerald-400 text-emerald-900",
  "bg-amber-200 border-amber-400 text-amber-900",
  "bg-violet-200 border-violet-400 text-violet-900",
  "bg-rose-200 border-rose-400 text-rose-900",
  "bg-cyan-200 border-cyan-400 text-cyan-900",
  "bg-lime-200 border-lime-400 text-lime-900",
  "bg-orange-200 border-orange-400 text-orange-900",
  "bg-fuchsia-200 border-fuchsia-400 text-fuchsia-900",
  "bg-teal-200 border-teal-400 text-teal-900",
];

function VlekEditDialog({
  room,
  floorId,
  onClose,
}: {
  room: FloorPlanRoom;
  floorId: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [department, setDepartment] = useState(room.department ?? "");
  const [functionType, setFunctionType] = useState(room.functionType ?? "");
  const update = useUpdateRoomDossier();

  const submit = () => {
    update.mutate(
      {
        id: room.id,
        data: {
          department: department.trim() === "" ? null : department.trim(),
          functionType: functionType.trim() || undefined,
          updatedAt: room.updatedAt ?? "",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetFloorPlanQueryKey(floorId) });
          toast({ title: "Ruimte bijgewerkt" });
          onClose();
        },
        onError: (error) => {
          if (error.status === 409) {
            queryClient.invalidateQueries({ queryKey: getGetFloorPlanQueryKey(floorId) });
            toast({
              title: "Ruimte ondertussen gewijzigd",
              description:
                "Iemand anders heeft dit vlekkenplan-item zojuist bewerkt. Sluit de dialoog en probeer het opnieuw.",
              variant: "destructive",
            });
            onClose();
          } else {
            toast({ title: "Bijwerken mislukt", variant: "destructive" });
          }
        },
      },
    );
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Pencil className="h-4 w-4" /> {room.name} <span className="font-mono text-sm text-muted-foreground">({room.code})</span>
        </DialogTitle>
        <DialogDescription>
          Wijzig afdeling of functie. Het vlekkenplan wordt direct bijgewerkt.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vlek-dept">Afdeling</Label>
          <Input
            id="vlek-dept"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Bijv. Facilitair, ICT, HR"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vlek-func">Functie</Label>
          <Input
            id="vlek-func"
            value={functionType}
            onChange={(e) => setFunctionType(e.target.value)}
            placeholder="Bijv. Kantoor, Vergaderruimte"
          />
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
          <div>Oppervlakte: {room.areaM2 ?? "–"} m²</div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annuleren</Button>
        <Button onClick={submit} disabled={update.isPending}>
          {update.isPending ? "Opslaan…" : "Opslaan"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Vlekkenplan({
  floorId,
  colorBy,
  canManage,
}: {
  floorId: number;
  colorBy: "department" | "functionType";
  canManage: boolean;
}) {
  const [, setLocation] = useLocation();
  const [editRoom, setEditRoom] = useState<FloorPlanRoom | null>(null);
  const { data: plan, isLoading } = useGetFloorPlan(floorId, {
    query: { queryKey: getGetFloorPlanQueryKey(floorId) },
  });

  const { colorMap, legend } = useMemo(() => {
    const map = new Map<string, string>();
    const vvoByKey = new Map<string, number>();
    const rooms = plan?.rooms ?? [];
    for (const r of rooms) {
      const key = (colorBy === "department" ? r.department : r.functionType) ?? "Onbekend";
      if (!map.has(key)) map.set(key, PALETTE[map.size % PALETTE.length]!);
      vvoByKey.set(key, (vvoByKey.get(key) ?? 0) + (r.areaVvoM2 ?? r.areaM2 ?? 0));
    }
    return {
      colorMap: map,
      legend: Array.from(map.entries()).map(([label, cls]) => ({
        label,
        cls,
        vvo: vvoByKey.get(label) ?? 0,
      })),
    };
  }, [plan, colorBy]);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!plan || plan.rooms.length === 0)
    return <p className="text-sm text-muted-foreground py-6 text-center">Geen ruimtes op deze verdieping.</p>;

  const totalArea = plan.rooms.reduce((s, r) => s + (r.areaM2 ?? 0), 0) || 1;

  const keyOf = (r: FloorPlanRoom) => (colorBy === "department" ? r.department : r.functionType) ?? "Onbekend";

  return (
    <div className="space-y-4">
      <Dialog open={!!editRoom} onOpenChange={(open) => { if (!open) setEditRoom(null); }}>
        <div
          className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3 min-h-[180px]"
          data-testid={`vlekkenplan-${floorId}`}
        >
          {plan.rooms.map((r) => {
            const share = (r.areaM2 ?? 0) / totalArea;
            const tileButton = (
              <button
                onClick={() => { if (canManage) setEditRoom(r); }}
                className={cn(
                  "rounded-md border-2 p-2 text-left transition-transform hover:scale-[1.02] hover:shadow-md min-w-[90px] cursor-pointer",
                  colorMap.get(keyOf(r)),
                )}
                style={{ flexGrow: Math.max(1, Math.round(share * 100)), flexBasis: `${Math.max(8, share * 100)}%` }}
                title={canManage ? `${r.name} — klik om afdeling/functie te wijzigen` : `${r.name} (${r.code}) — klik voor details`}
                data-testid={`vlek-${r.code}`}
              >
                <div className="text-xs font-semibold truncate">{r.name}</div>
                <div className="text-[10px] font-mono opacity-70">{r.code}</div>
                <div className="text-[10px] opacity-80">{r.areaM2 ?? "?"} m² · {keyOf(r)}</div>
                {canManage && (
                  <div className="text-[9px] opacity-50 mt-0.5 flex items-center gap-0.5">
                    <Pencil className="h-2 w-2 inline" /> bewerken
                  </div>
                )}
              </button>
            );

            if (canManage) {
              return <span key={r.id} style={{ flexGrow: Math.max(1, Math.round(share * 100)), flexBasis: `${Math.max(8, share * 100)}%` }}>{tileButton}</span>;
            }

            return (
              <Popover key={r.id}>
                <PopoverTrigger asChild style={{ flexGrow: Math.max(1, Math.round(share * 100)), flexBasis: `${Math.max(8, share * 100)}%` }}>
                  {tileButton}
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start" side="top">
                  <div className="space-y-3">
                    <div>
                      <div className="font-semibold text-sm">{r.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{r.code}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div className="text-muted-foreground">Afdeling</div>
                      <div className="font-medium">{r.department ?? "–"}</div>
                      <div className="text-muted-foreground">Functie</div>
                      <div className="font-medium">{r.functionType ?? "–"}</div>
                      <div className="text-muted-foreground flex items-center gap-1"><Maximize2 className="h-3 w-3" /> Oppervlakte</div>
                      <div className="font-medium">{r.areaM2 != null ? `${r.areaM2} m²` : "–"}</div>
                      {r.capacity != null && (
                        <>
                          <div className="text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> Bezetting</div>
                          <div className="font-medium">{r.capacity} personen</div>
                        </>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => setLocation(`/ruimtes/${r.id}`)}
                    >
                      Ga naar ruimtepagina <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>
        {editRoom && (
          <VlekEditDialog room={editRoom} floorId={floorId} onClose={() => setEditRoom(null)} />
        )}
      </Dialog>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {legend.map(({ label, cls, vvo }) => (
          <div key={label} className="flex items-center gap-1.5 text-xs">
            <span className={cn("h-3 w-3 rounded-sm border-2 inline-block flex-shrink-0", cls)} />
            <span className="capitalize">{label}</span>
            {vvo > 0 && (
              <span className="text-muted-foreground">— {Math.round(vvo)} m² VVO</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GebouwDetailPage({ id }: { id: string }) {
  const buildingId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [colorBy, setColorBy] = useState<"department" | "functionType">("department");
  const [selectedFloorId, setSelectedFloorId] = useState<number | null>(null);

  const { data: user } = useGetCurrentUser();
  const canManage = user?.role === "facilitair_manager" || user?.role === "beheerder";

  const { data: building, isLoading } = useGetBuilding(buildingId, {
    query: { enabled: !!buildingId, queryKey: getGetBuildingQueryKey(buildingId) },
  });
  const { data: documents } = useListBuildingDocuments(buildingId, {
    query: { enabled: !!buildingId && canManage, queryKey: getListBuildingDocumentsQueryKey(buildingId) },
  });
  const deleteDoc = useDeleteBuildingDocument();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!building) return <div>Gebouw niet gevonden.</div>;

  const activeFloorId = selectedFloorId ?? building.floors[0]?.id ?? null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/vastgoed")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Building className="h-6 w-6 text-primary" /> {building.name}
            </h1>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <MapPin className="h-3.5 w-3.5" />
            {building.address ?? "-"} • {building.siteName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{building.floorCount}</div><div className="text-xs text-muted-foreground">Verdiepingen</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{building.roomCount}</div><div className="text-xs text-muted-foreground">Ruimtes</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{Math.round(building.totalAreaM2)} m²</div><div className="text-xs text-muted-foreground">Totale oppervlakte</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" /> Vlekkenplan
              </CardTitle>
              <CardDescription>Schematische indeling per verdieping, blokgrootte naar oppervlakte.</CardDescription>
            </div>
            <Tabs value={colorBy} onValueChange={(v) => setColorBy(v as typeof colorBy)}>
              <TabsList>
                <TabsTrigger value="department">Kleur op afdeling</TabsTrigger>
                <TabsTrigger value="functionType">Kleur op functie</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {building.floors.map((f) => (
              <Button
                key={f.id}
                variant={f.id === activeFloorId ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedFloorId(f.id)}
                data-testid={`floor-tab-${f.id}`}
              >
                <Layers className="h-3.5 w-3.5 mr-1.5" /> {f.name}
              </Button>
            ))}
          </div>
          {activeFloorId != null && <Vlekkenplan floorId={activeFloorId} colorBy={colorBy} canManage={canManage} />}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Gebouwdocumenten
                </CardTitle>
                <CardDescription>Huurcontracten, bouwtekeningen en energielabels.</CardDescription>
              </div>
              <UploadDocumentDialog buildingId={buildingId} />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {!documents?.length ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Nog geen documenten geüpload.</div>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className="p-4 flex items-center justify-between gap-4" data-testid={`document-${doc.id}`}>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{doc.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        <Badge variant="secondary" className="mr-2">{docCategoryLabel(doc.category)}</Badge>
                        {formatBytes(doc.sizeBytes)} • {doc.uploadedByName ?? "Onbekend"} • {format(new Date(doc.createdAt), "d MMM yyyy", { locale: nl })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" asChild>
                        <a href={`${API_BASE}/storage${doc.objectPath}`} target="_blank" rel="noreferrer" title="Downloaden">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Verwijderen"
                        onClick={() =>
                          deleteDoc.mutate(
                            { id: doc.id },
                            {
                              onSuccess: () => {
                                queryClient.invalidateQueries({ queryKey: getListBuildingDocumentsQueryKey(buildingId) });
                                toast({ title: "Document verwijderd" });
                              },
                              onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
                            },
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
