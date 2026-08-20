import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { NieuweTaakDialog } from "./MjopPage";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Camera,
  ClipboardCheck,
  Euro,
  Info,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { getIntlLocale } from "@/i18n";
import {
  scoreColor,
  scoreLabel,
  ernstColor,
  taakStatusColor,
  taakStatusLabel,
  ERNST_OPTIES,
  OMVANG_OPTIES,
  INTENSITEIT_OPTIES,
  euro,
  deriveNen2767Score,
} from "./mjop-helpers";

const API_BASE = "/api";

type DraftGebrek = Gebrek & { uploading?: boolean };

function NieuweMetingDialog({
  bouwdeelId,
  onBadScore,
}: {
  bouwdeelId: number;
  onBadScore?: (suggestion: { type: string; message: string }) => void;
}) {
  const { t } = useTranslation("mjop");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toelichting, setToelichting] = useState("");
  const [gebreken, setGebreken] = useState<DraftGebrek[]>([]);
  const [scoreOverride, setScoreOverride] = useState<string>("__auto__");
  const createMeting = useCreateConditiemeting();

  // Auto-derive score whenever gebreken change
  const scoreAfgeleid = deriveNen2767Score(
    gebreken.map((g) => ({
      ernst: g.ernst,
      omvang: g.omvang ?? null,
      intensiteit: g.intensiteit ?? null,
    })),
  );
  const effectiveScore = scoreOverride !== "__auto__"
    ? Number(scoreOverride)
    : (scoreAfgeleid ?? 1);

  const addGebrek = () =>
    setGebreken((g) => [
      ...g,
      {
        description: "",
        ernst: "licht",
        omvang: "< 2%",
        intensiteit: "midden",
        photoPath: null,
      },
    ]);

  const updateGebrek = (i: number, patch: Partial<DraftGebrek>) =>
    setGebreken((g) => g.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const removeGebrek = (i: number) =>
    setGebreken((g) => g.filter((_, idx) => idx !== i));

  const uploadPhoto = async (i: number, file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t("meting.fileTooLarge"), variant: "destructive" });
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
        throw new Error(err?.error ?? t("meting.uploadFailed"));
      }
      const { objectPath } = (await resp.json()) as { objectPath: string };
      updateGebrek(i, { photoPath: objectPath, uploading: false });
      toast({ title: t("meting.photoUploaded") });
    } catch (e) {
      updateGebrek(i, { uploading: false });
      toast({
        title: e instanceof Error ? e.message : t("meting.photoUploadFailed"),
        variant: "destructive",
      });
    }
  };

  const reset = () => {
    setToelichting("");
    setGebreken([]);
    setScoreOverride("__auto__");
  };

  const onSubmit = () => {
    const valid = gebreken.filter((g) => g.description.trim().length > 0);
    createMeting.mutate(
      {
        id: bouwdeelId,
        data: {
          scoreOverride: scoreOverride !== "__auto__" ? Number(scoreOverride) : null,
          toelichting: toelichting || null,
          gebreken: valid.map(({ uploading, ...g }) => g),
        },
      },
      {
        onSuccess: (meting) => {
          toast({ title: t("meting.toastSuccess") });
          setOpen(false);
          reset();
          queryClient.invalidateQueries({
            queryKey: [`/api/bouwdelen/${bouwdeelId}/conditiemetingen`],
          });
          queryClient.invalidateQueries({ queryKey: ["/api/bouwdelen"] });
          queryClient.invalidateQueries({
            queryKey: [`/api/bouwdelen/${bouwdeelId}`],
          });
          if (meting.suggestion?.type && meting.suggestion?.message) {
            onBadScore?.({ type: meting.suggestion.type, message: meting.suggestion.message });
          }
        },
        onError: () =>
          toast({ title: t("meting.toastError"), variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <ClipboardCheck className="mr-2 h-4 w-4" />
          {t("meting.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("meting.title")}</DialogTitle>
          <DialogDescription>
            {t("meting.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Auto-derived score display */}
          <div className="rounded-lg border bg-muted/40 p-3 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t("meting.derivedScore")}
              </div>
              <div className="flex items-center gap-2">
                {scoreAfgeleid ? (
                  <Badge
                    variant="secondary"
                    className={cn("border-transparent font-bold text-base px-3 py-1", scoreColor(scoreAfgeleid))}
                  >
                    {t("meting.scoreLabel", { score: scoreAfgeleid, label: scoreLabel(scoreAfgeleid, t) })}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-base px-3 py-1">
                    {gebreken.length === 0 ? t("meting.noGebrekenScore") : t("meting.fillGebreken")}
                  </Badge>
                )}
                {effectiveScore !== scoreAfgeleid && scoreOverride !== "__auto__" && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" /> {t("meting.overridden")}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1 min-w-[140px]">
              <Label className="text-xs">{t("meting.manualOverride")}</Label>
              <Select value={scoreOverride} onValueChange={setScoreOverride}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder={t("meting.automatic")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">{t("meting.automatic")}</SelectItem>
                  {[1, 2, 3, 4, 5, 6].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {t("meting.scoreLabel", { score: s, label: scoreLabel(s, t) })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("meting.toelichting")}</Label>
            <Textarea
              rows={2}
              value={toelichting}
              onChange={(e) => setToelichting(e.target.value)}
              placeholder={t("meting.toelichtingPlaceholder")}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("meting.gebreken")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={addGebrek}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("meting.addGebrek")}
              </Button>
            </div>
            {gebreken.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("meting.noGebreken")}
              </p>
            )}
            {gebreken.map((g, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-3 bg-muted/30">
                <div className="flex items-start gap-2">
                  <Input
                    className="flex-1"
                    placeholder={t("meting.gebrekPlaceholder")}
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
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("meting.ernst")}</Label>
                    <Select
                      value={g.ernst}
                      onValueChange={(v) => updateGebrek(i, { ernst: v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ERNST_OPTIES.map((e) => (
                          <SelectItem key={e} value={e} className="capitalize">
                            {t(`ernst.${e}`, { defaultValue: e })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("meting.omvang")}</Label>
                    <Select
                      value={g.omvang ?? ""}
                      onValueChange={(v) => updateGebrek(i, { omvang: v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={t("meting.omvangPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {OMVANG_OPTIES.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("meting.intensiteit")}</Label>
                    <Select
                      value={g.intensiteit ?? "midden"}
                      onValueChange={(v) => updateGebrek(i, { intensiteit: v })}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INTENSITEIT_OPTIES.map((it) => (
                          <SelectItem key={it} value={it} className="capitalize">
                            {t(`intensiteit.${it}`, { defaultValue: it })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                    {g.photoPath ? t("meting.replacePhoto") : t("meting.uploadPhoto")}
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
                  {g.photoPath && (
                    <div className="relative inline-block">
                      <img
                        src={`${API_BASE}/storage${g.photoPath}`}
                        alt={t("meting.photoAlt")}
                        className="h-16 rounded-md border object-cover"
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
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("meting.cancel")}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={createMeting.isPending || gebreken.some((g) => g.uploading)}
          >
            {createMeting.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("meting.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BouwdeelDetailPage({ id }: { id: string }) {
  const { t } = useTranslation("mjop");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bouwdeelId = Number(id);
  const { data: user } = useGetCurrentUser();
  const { data: bouwdeel, isLoading } = useGetBouwdeel(bouwdeelId);
  const { data: metingen } = useListConditiemetingen(bouwdeelId);
  const { data: taken } = useListMjopTaken({ bouwdeelId });
  const convert = useConvertMjopTaakToTicket();
  const [metingSuggestion, setMetingSuggestion] = useState<{
    type: string;
    message: string;
  } | null>(null);
  const [mjopDialogOpen, setMjopDialogOpen] = useState(false);

  const canManage =
    user?.role === "facilitair_manager" || user?.role === "beheerder";

  const onConvert = (taakId: number) => {
    convert.mutate(
      { id: taakId },
      {
        onSuccess: (taak) => {
          toast({
            title: t("toastMeldingCreated"),
            description: t("toastMeldingDescription", { ticket: taak.ticketNumber ?? "" }),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/mjop-taken"] });
        },
        onError: () =>
          toast({ title: t("toastConvertError"), variant: "destructive" }),
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
        <h3 className="text-lg font-medium">{t("detail.notFound")}</h3>
        <Button variant="link" onClick={() => setLocation("/mjop")}>
          {t("detail.backToMjop")}
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
                  {t("detail.conditie", { score: bouwdeel.laatsteScore, label: scoreLabel(bouwdeel.laatsteScore, t) })}
                </Badge>
              ) : (
                <Badge variant="outline">{t("page.notMeasured")}</Badge>
              )}
            </h1>
            <p className="text-muted-foreground font-mono text-sm">
              {bouwdeel.code}
              {bouwdeel.nlSfbCode && (
                <span className="ml-2 font-sans text-xs bg-muted px-1.5 py-0.5 rounded">
                  NL-SfB {bouwdeel.nlSfbCode}
                </span>
              )}
            </p>
          </div>
        </div>
        {canManage && (
          <NieuweMetingDialog
            bouwdeelId={bouwdeelId}
            onBadScore={setMetingSuggestion}
          />
        )}
      </div>

      {metingSuggestion && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{metingSuggestion.message}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                onClick={() => setMjopDialogOpen(true)}
              >
                {t("detail.createMjopTaak")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-amber-700 hover:bg-amber-100"
                onClick={() => setMetingSuggestion(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <NieuweTaakDialog
        externalOpen={mjopDialogOpen}
        onExternalOpenChange={(v) => {
          setMjopDialogOpen(v);
          if (!v) setMetingSuggestion(null);
        }}
        prefill={{
          bouwdeelId: bouwdeelId,
          taskType: metingSuggestion?.type === "inspectie" ? "inspectie" : "onderhoud",
          plannedYear: new Date().getFullYear() + 1,
        }}
      />

      <Card>
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> {t("detail.locatie")}
            </div>
            <div className="font-medium mt-1">
              {bouwdeel.buildingName}
              {bouwdeel.floorName ? ` • ${bouwdeel.floorName}` : ""}
              {bouwdeel.roomName ? ` • ${bouwdeel.roomName}` : ""}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5" /> {t("detail.categorieMateriaal")}
            </div>
            <div className="font-medium mt-1 capitalize">
              {t(`categories.${bouwdeel.category}`, { defaultValue: bouwdeel.category })}
              {bouwdeel.material ? ` • ${bouwdeel.material}` : ""}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("detail.levenscyclus")}</div>
            <div className="font-medium mt-1">
              {t("detail.lifespanYears", { from: bouwdeel.installYear, to: endOfLife, years: bouwdeel.expectedLifespanYears })}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <Euro className="h-3.5 w-3.5" /> {t("detail.vervangingskosten")}
            </div>
            <div className="font-medium mt-1">{euro(bouwdeel.replacementCost)}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("detail.metingenTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!metingen?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {t("detail.noMetingen")}
              </p>
            ) : (
              metingen.map((m) => (
                <div key={m.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "border-transparent font-semibold",
                          scoreColor(m.score),
                        )}
                      >
                        {t("detail.scoreLine", { score: m.score, label: scoreLabel(m.score, t) })}
                      </Badge>
                      {m.scoreOverride && m.scoreAfgeleid && m.scoreOverride !== m.scoreAfgeleid && (
                        <span className="text-xs text-muted-foreground">
                          {t("detail.derivedOverridden", { score: m.scoreAfgeleid })}
                        </span>
                      )}
                      {!m.scoreOverride && m.scoreAfgeleid && (
                        <span className="text-xs text-muted-foreground">
                          {t("detail.autoDerived")}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.measuredAt).toLocaleDateString(getIntlLocale(), {
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
                        {t("detail.gebreken")}
                      </div>
                      {m.gebreken.map((g, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-3 text-sm bg-muted/40 rounded-md p-2"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{g.description}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "border-transparent text-xs",
                                  ernstColor(g.ernst),
                                )}
                              >
                                {t(`ernst.${g.ernst}`, { defaultValue: g.ernst })}
                              </Badge>
                              {g.omvang && (
                                <Badge variant="outline" className="text-xs">
                                  {t("detail.omvang", { value: g.omvang })}
                                </Badge>
                              )}
                              {g.intensiteit && (
                                <Badge variant="outline" className="text-xs">
                                  {t("detail.intensiteit", { value: t(`intensiteit.${g.intensiteit}`, { defaultValue: g.intensiteit }) })}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {g.photoPath && (
                            <img
                              src={`${API_BASE}/storage${g.photoPath}`}
                              alt={t("detail.photoAlt")}
                              className="h-16 w-16 rounded object-cover border flex-shrink-0"
                            />
                          )}
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
            <CardTitle className="text-base">{t("detail.takenTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!taken?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {t("detail.noTaken")}
              </p>
            ) : (
              taken.map((tk) => (
                <div key={tk.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{tk.title}</p>
                      {tk.description && (
                        <p className="text-xs text-muted-foreground">{tk.description}</p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn("border-transparent text-xs", taakStatusColor(tk.status))}
                    >
                      {taakStatusLabel(tk.status, t)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="capitalize">{t(`taakTypes.${tk.taskType}`, { defaultValue: tk.taskType })}</span>
                    <span>{tk.plannedYear}</span>
                    <span className="font-medium text-foreground">{euro(tk.estimatedCost)}</span>
                    {tk.ticketId ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setLocation(`/meldingen/${tk.ticketId}`)}
                      >
                        <Ticket className="mr-1 h-3 w-3" />
                        {tk.ticketNumber}
                      </Button>
                    ) : canManage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={convert.isPending}
                        onClick={() => onConvert(tk.id)}
                      >
                        <Ticket className="mr-1 h-3 w-3" />
                        {t("taken.toMelding")}
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
