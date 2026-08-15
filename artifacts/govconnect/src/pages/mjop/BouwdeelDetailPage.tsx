import { useState } from "react";
import { useLocation } from "wouter";
import {
  useGetBouwdeel,
  useListConditiemetingen,
  useCreateConditiemeting,
  useListMjopTaken,
  useConvertMjopTaakToTicket,
  useGetCurrentUser,
  type Gebrek,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Camera,
  ClipboardCheck,
  Euro,
  Loader2,
  Plus,
  Ticket,
  Trash2,
  Wrench,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  scoreColor,
  scoreLabel,
  ernstColor,
  taakStatusColor,
  taakStatusLabel,
  ERNST_OPTIES,
  OMVANG_OPTIES,
  euro,
} from "./mjop-helpers";

const API_BASE = "/api";

type DraftGebrek = Gebrek & { uploading?: boolean };

function NieuweMetingDialog({ bouwdeelId }: { bouwdeelId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<string>("");
  const [toelichting, setToelichting] = useState("");
  const [gebreken, setGebreken] = useState<DraftGebrek[]>([]);
  const createMeting = useCreateConditiemeting();

  const addGebrek = () =>
    setGebreken((g) => [
      ...g,
      { description: "", ernst: "licht", omvang: "< 2%", photoPath: null },
    ]);

  const updateGebrek = (i: number, patch: Partial<DraftGebrek>) =>
    setGebreken((g) => g.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const removeGebrek = (i: number) =>
    setGebreken((g) => g.filter((_, idx) => idx !== i));

  const uploadPhoto = async (i: number, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Bestand is te groot (max 10 MB)", variant: "destructive" });
      return;
    }
    updateGebrek(i, { uploading: true });
    try {
      const resp = await fetch(`${API_BASE}/storage/uploads`, {
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
      updateGebrek(i, { photoPath: objectPath, uploading: false });
      toast({ title: "Foto geüpload" });
    } catch (e) {
      updateGebrek(i, { uploading: false });
      toast({
        title: e instanceof Error ? e.message : "Foto uploaden mislukt",
        variant: "destructive",
      });
    }
  };

  const reset = () => {
    setScore("");
    setToelichting("");
    setGebreken([]);
  };

  const onSubmit = () => {
    if (!score) {
      toast({ title: "Kies een conditiescore", variant: "destructive" });
      return;
    }
    const valid = gebreken.filter((g) => g.description.trim().length > 0);
    createMeting.mutate(
      {
        id: bouwdeelId,
        data: {
          score: Number(score),
          toelichting: toelichting || null,
          gebreken: valid.map(({ uploading, ...g }) => g),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Conditiemeting vastgelegd" });
          setOpen(false);
          reset();
          queryClient.invalidateQueries({
            queryKey: [`/api/bouwdelen/${bouwdeelId}/conditiemetingen`],
          });
          queryClient.invalidateQueries({ queryKey: ["/api/bouwdelen"] });
          queryClient.invalidateQueries({
            queryKey: [`/api/bouwdelen/${bouwdeelId}`],
          });
        },
        onError: () =>
          toast({ title: "Vastleggen mislukt", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <ClipboardCheck className="mr-2 h-4 w-4" />
          Conditiemeting
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe conditiemeting (NEN 2767)</DialogTitle>
          <DialogDescription>
            Leg de conditiescore vast en registreer eventuele gebreken met foto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Conditiescore</Label>
              <Select value={score} onValueChange={setScore}>
                <SelectTrigger>
                  <SelectValue placeholder="Kies score (1-6)" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} — {scoreLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Toelichting (optioneel)</Label>
            <Textarea
              rows={2}
              value={toelichting}
              onChange={(e) => setToelichting(e.target.value)}
              placeholder="Algemene bevindingen van de inspectie"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Gebreken</Label>
              <Button type="button" variant="outline" size="sm" onClick={addGebrek}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Gebrek toevoegen
              </Button>
            </div>
            {gebreken.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Geen gebreken geregistreerd.
              </p>
            )}
            {gebreken.map((g, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-3 bg-muted/30">
                <div className="flex items-start gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Omschrijving van het gebrek"
                    value={g.description}
                    onChange={(e) => updateGebrek(i, { description: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeGebrek(i)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={g.ernst}
                    onValueChange={(v) => updateGebrek(i, { ernst: v })}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ERNST_OPTIES.map((e) => (
                        <SelectItem key={e} value={e} className="capitalize">
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={g.omvang ?? ""}
                    onValueChange={(v) => updateGebrek(i, { omvang: v })}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Omvang" />
                    </SelectTrigger>
                    <SelectContent>
                      {OMVANG_OPTIES.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={g.uploading}
                      onClick={() =>
                        document.getElementById(`gebrek-foto-${i}`)?.click()
                      }
                    >
                      {g.uploading ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Camera className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {g.photoPath ? "Foto vervangen" : "Foto uploaden"}
                    </Button>
                    <input
                      id={`gebrek-foto-${i}`}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadPhoto(i, file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </div>
                {g.photoPath && (
                  <div className="relative inline-block">
                    <img
                      src={`${API_BASE}/storage${g.photoPath}`}
                      alt="Foto van gebrek"
                      className="h-24 rounded-md border object-cover"
                    />
                    <button
                      type="button"
                      className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5 shadow"
                      onClick={() => updateGebrek(i, { photoPath: null })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Annuleren
          </Button>
          <Button
            onClick={onSubmit}
            disabled={createMeting.isPending || gebreken.some((g) => g.uploading)}
          >
            {createMeting.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Vastleggen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BouwdeelDetailPage({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bouwdeelId = Number(id);
  const { data: user } = useGetCurrentUser();
  const { data: bouwdeel, isLoading } = useGetBouwdeel(bouwdeelId);
  const { data: metingen } = useListConditiemetingen(bouwdeelId);
  const { data: taken } = useListMjopTaken({ bouwdeelId });
  const convert = useConvertMjopTaakToTicket();

  const canManage =
    user?.role === "facilitair_manager" || user?.role === "beheerder";

  const onConvert = (taakId: number) => {
    convert.mutate(
      { id: taakId },
      {
        onSuccess: (taak) => {
          toast({
            title: "Melding aangemaakt",
            description: `Servicedesk-ticket ${taak.ticketNumber ?? ""} is aangemaakt.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/mjop-taken"] });
        },
        onError: () =>
          toast({ title: "Omzetten mislukt", variant: "destructive" }),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!bouwdeel) {
    return (
      <div className="text-center py-24">
        <h3 className="text-lg font-medium">Bouwdeel niet gevonden</h3>
        <Button variant="link" onClick={() => setLocation("/mjop")}>
          Terug naar MJOP
        </Button>
      </div>
    );
  }

  const endOfLife = bouwdeel.installYear + bouwdeel.expectedLifespanYears;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/mjop")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
              {bouwdeel.name}
              {bouwdeel.laatsteScore ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "border-transparent font-semibold",
                    scoreColor(bouwdeel.laatsteScore),
                  )}
                >
                  Conditie {bouwdeel.laatsteScore} —{" "}
                  {scoreLabel(bouwdeel.laatsteScore)}
                </Badge>
              ) : (
                <Badge variant="outline">Niet gemeten</Badge>
              )}
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              {bouwdeel.code}
            </p>
          </div>
        </div>
        {canManage && <NieuweMetingDialog bouwdeelId={bouwdeelId} />}
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Locatie
            </div>
            <div className="font-medium mt-1">
              {bouwdeel.buildingName}
              {bouwdeel.floorName ? ` • ${bouwdeel.floorName}` : ""}
              {bouwdeel.roomName ? ` • ${bouwdeel.roomName}` : ""}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> Categorie & materiaal
            </div>
            <div className="font-medium mt-1 capitalize">
              {bouwdeel.category}
              {bouwdeel.material ? ` • ${bouwdeel.material}` : ""}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Levenscyclus</div>
            <div className="font-medium mt-1">
              {bouwdeel.installYear} — {endOfLife} ({bouwdeel.expectedLifespanYears}{" "}
              jaar)
            </div>
          </div>
          <div>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Euro className="h-3.5 w-3.5" /> Vervangingskosten
            </div>
            <div className="font-medium mt-1">{euro(bouwdeel.replacementCost)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Conditiemetingen (NEN 2767)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!metingen?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Nog geen conditiemetingen vastgelegd.
              </p>
            ) : (
              metingen.map((m) => (
                <div key={m.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "border-transparent font-semibold",
                        scoreColor(m.score),
                      )}
                    >
                      Score {m.score} — {scoreLabel(m.score)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.measuredAt).toLocaleDateString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      • {m.inspectorName}
                    </span>
                  </div>
                  {m.toelichting && (
                    <p className="text-sm text-muted-foreground">{m.toelichting}</p>
                  )}
                  {m.gebreken.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase">
                        Gebreken
                      </div>
                      {m.gebreken.map((g, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 text-sm bg-muted/40 rounded-md p-2"
                        >
                          {g.photoPath && (
                            <a
                              href={`${API_BASE}/storage${g.photoPath}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <img
                                src={`${API_BASE}/storage${g.photoPath}`}
                                alt="Foto van gebrek"
                                className="h-16 w-16 rounded object-cover border"
                              />
                            </a>
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{g.description}</div>
                            <div className="flex gap-1.5 mt-1">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "border-transparent capitalize",
                                  ernstColor(g.ernst),
                                )}
                              >
                                {g.ernst}
                              </Badge>
                              {g.omvang && (
                                <Badge variant="outline">omvang {g.omvang}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">MJOP-taken</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!taken?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Geen taken voor dit bouwdeel.
              </p>
            ) : (
              taken.map((t) => (
                <div
                  key={t.id}
                  className="rounded-lg border p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {t.taskType} • {t.plannedYear} • {euro(t.estimatedCost)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant="secondary"
                      className={cn("border-transparent", taakStatusColor(t.status))}
                    >
                      {taakStatusLabel(t.status)}
                    </Badge>
                    {t.ticketId ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => setLocation(`/meldingen/${t.ticketId}`)}
                      >
                        {t.ticketNumber}
                      </Button>
                    ) : canManage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={convert.isPending}
                        onClick={() => onConvert(t.id)}
                      >
                        <Ticket className="mr-1.5 h-3.5 w-3.5" />
                        Naar melding
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
