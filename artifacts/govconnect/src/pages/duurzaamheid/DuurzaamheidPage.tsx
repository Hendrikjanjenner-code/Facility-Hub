import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetStructure,
  useListMeterReadings,
  useCreateMeterReading,
  useUpdateMeterReading,
  useDeleteMeterReading,
  useImportMeterReadings,
  useListWasteRegistrations,
  useCreateWasteRegistration,
  useGetSustainabilityReport,
  useGetUserPreference,
  usePutUserPreference,
  useDeleteUserPreference,
  type MeterReading,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Leaf, Plus, Upload, Loader2, Gauge, Trash2, FileSpreadsheet, Download, Filter, X, Pencil } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip,
  Legend, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const METER_TYPES = [
  { value: "elektriciteit", label: "Elektriciteit", unit: "kWh" },
  { value: "gas", label: "Gas", unit: "m3" },
  { value: "water", label: "Water", unit: "m3" },
];
const WASTE_CATEGORIES = ["restafval", "papier", "gft", "plastic", "glas", "chemisch"];
const WASTE_COLORS: Record<string, string> = {
  restafval: "#64748b", papier: "#2563eb", gft: "#16a34a", plastic: "#ea580c", glas: "#0891b2", chemisch: "#dc2626",
};
const TYPE_COLORS: Record<string, string> = { elektriciteit: "#eab308", gas: "#f97316", water: "#0ea5e9" };

const meterSchema = z.object({
  buildingId: z.number({ message: "Kies een gebouw" }),
  meterType: z.string().min(1, "Kies een metertype"),
  readingDate: z.string().min(10, "Datum is verplicht"),
  value: z.coerce.number().min(0, "Meterstand is verplicht"),
});

const correctSchema = z.object({
  readingDate: z.string().min(10, "Datum is verplicht"),
  value: z.coerce.number().min(0, "Meterstand is verplicht"),
});

const wasteSchema = z.object({
  buildingId: z.number({ message: "Kies een gebouw" }),
  registrationDate: z.string().min(10, "Datum is verplicht"),
  category: z.string().min(1, "Kies een categorie"),
  weightKg: z.coerce.number().min(0.1, "Gewicht is verplicht"),
});

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const sep = lines[0]!.includes(";") ? ";" : ",";
  const headers = lines[0]!.split(sep).map((h) => h.trim().toLowerCase());
  return { headers, rows: lines.slice(1).map((l) => l.split(sep).map((c) => c.trim())) };
}

/** Return the ISO date range for a quarter in a given year. */
function getQuarterRange(year: number, q: 1 | 2 | 3 | 4): { from: string; to: string } {
  const starts = ["01-01", "04-01", "07-01", "10-01"] as const;
  const ends   = ["03-31", "06-30", "09-30", "12-31"] as const;
  return { from: `${year}-${starts[q - 1]}`, to: `${year}-${ends[q - 1]}` };
}

/** Build a filename that reflects the active filters. */
function buildExportFilename(buildingName: string | undefined, dateFrom: string, dateTo: string): string {
  const parts = ["duurzaamheid"];
  if (buildingName) parts.push(buildingName.toLowerCase().replace(/\s+/g, "_"));
  if (dateFrom || dateTo) {
    const from = dateFrom || "begin";
    const to = dateTo || "nu";
    parts.push(`${from}_${to}`);
  } else {
    parts.push(new Date().toLocaleDateString("sv-SE"));
  }
  return `${parts.join("_")}.csv`;
}

export default function DuurzaamheidPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [wasteDialogOpen, setWasteDialogOpen] = useState(false);
  const [editReading, setEditReading] = useState<MeterReading | null>(null);
  const [deleteReading, setDeleteReading] = useState<MeterReading | null>(null);

  // Filter state for the rapportage tab — persisted server-side via /api/user-preferences
  const FILTER_KEY = "duurzaamheid_report_filters";
  const [filterBuildingId, setFilterBuildingIdRaw] = useState<string>("");
  const [filterDateFrom, setFilterDateFromRaw] = useState<string>("");
  const [filterDateTo, setFilterDateToRaw] = useState<string>("");

  // initialisedFromServer: true after the first server response is applied.
  // userHasUnsavedChanges: true while the debounce is pending (local changes not yet saved).
  // putDebounceRef: handle for the pending PUT debounce.
  // generationRef: incremented on clear() so any in-flight PUT knows to abort.
  // bcRef: BroadcastChannel for real-time cross-tab synchronisation.
  const initialisedFromServer = useRef(false);
  const userHasUnsavedChanges = useRef(false);
  const putDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const { data: savedPref } = useGetUserPreference(FILTER_KEY, {
    // refetchOnWindowFocus lets a returning tab pick up changes made on another device.
    query: { refetchOnWindowFocus: true },
  });
  const putPref = usePutUserPreference();
  const deletePref = useDeleteUserPreference();

  /** Apply a raw preference JSON string (or null) to local filter state. */
  const applyPrefValue = (value: string | null) => {
    if (!value) {
      setFilterBuildingIdRaw("");
      setFilterDateFromRaw("");
      setFilterDateToRaw("");
      return;
    }
    try {
      const parsed = JSON.parse(value) as {
        buildingId?: string;
        dateFrom?: string;
        dateTo?: string;
      };
      setFilterBuildingIdRaw(parsed.buildingId ?? "");
      setFilterDateFromRaw(parsed.dateFrom ?? "");
      setFilterDateToRaw(parsed.dateTo ?? "");
    } catch {
      // malformed stored value — ignore
    }
  };

  // BroadcastChannel: receive preference updates from other tabs in the same browser.
  useEffect(() => {
    const bc = new BroadcastChannel("duurzaamheid_filters");
    bcRef.current = bc;
    bc.onmessage = (evt: MessageEvent<{ type: string; value: string | null }>) => {
      if (evt.data.type !== "update") return;
      if (userHasUnsavedChanges.current) return; // local unsaved changes take priority
      applyPrefValue(evt.data.value);
    };
    return () => { bc.close(); bcRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup pending debounce timer on unmount to prevent memory leaks.
  useEffect(() => {
    return () => { if (putDebounceRef.current) clearTimeout(putDebounceRef.current); };
  }, []);

  // Apply server preference on initial load and on window-focus refetches (cross-device sync).
  // Never overwrites pending local (unsaved) changes.
  useEffect(() => {
    if (!savedPref) return;
    if (!initialisedFromServer.current) {
      initialisedFromServer.current = true;
      if (!userHasUnsavedChanges.current) applyPrefValue(savedPref.value);
      return;
    }
    // Subsequent fetches (e.g. refetchOnWindowFocus): sync only when idle.
    if (!userHasUnsavedChanges.current) applyPrefValue(savedPref.value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPref]);

  const persistFilters = (buildingId: string, dateFrom: string, dateTo: string) => {
    // Capture current generation to detect if clear() fires before this PUT completes.
    const generation = generationRef.current;
    if (putDebounceRef.current) clearTimeout(putDebounceRef.current);
    putDebounceRef.current = setTimeout(() => {
      if (generationRef.current !== generation) return; // clear() was called — abort
      const value = JSON.stringify({ buildingId, dateFrom, dateTo });
      putPref.mutate(
        { key: FILTER_KEY, value },
        {
          onSuccess: () => {
            if (generationRef.current !== generation) return; // clear() fired meanwhile
            userHasUnsavedChanges.current = false;
            // Notify other tabs so they sync without a round-trip.
            bcRef.current?.postMessage({ type: "update", value });
          },
        },
      );
    }, 400);
  };

  const setFilterBuildingId = (v: string) => {
    userHasUnsavedChanges.current = true;
    setFilterBuildingIdRaw(v);
    persistFilters(v, filterDateFrom, filterDateTo);
  };
  const setFilterDateFrom = (v: string) => {
    userHasUnsavedChanges.current = true;
    setFilterDateFromRaw(v);
    persistFilters(filterBuildingId, v, filterDateTo);
  };
  const setFilterDateTo = (v: string) => {
    userHasUnsavedChanges.current = true;
    setFilterDateToRaw(v);
    persistFilters(filterBuildingId, filterDateFrom, v);
  };

  const { data: structure } = useGetStructure();
  const buildings = useMemo(
    () => (structure ?? []).flatMap((org) => org.sites.flatMap((s) => s.buildings.map((b) => ({ id: b.id, name: b.name })))),
    [structure],
  );

  const { data: readings } = useListMeterReadings();
  const { data: waste } = useListWasteRegistrations();

  // Build query params for the report — only send defined values
  const reportParams = useMemo(() => {
    const p: Record<string, string | number> = {};
    if (filterBuildingId) p.buildingId = Number(filterBuildingId);
    if (filterDateFrom) p.dateFrom = filterDateFrom;
    if (filterDateTo) p.dateTo = filterDateTo;
    return p;
  }, [filterBuildingId, filterDateFrom, filterDateTo]);

  const { data: report } = useGetSustainabilityReport(
    Object.keys(reportParams).length ? reportParams : undefined,
  );

  const createReading = useCreateMeterReading();
  const updateReading = useUpdateMeterReading();
  const doDeleteReading = useDeleteMeterReading();
  const importReadings = useImportMeterReadings();
  const createWaste = useCreateWasteRegistration();

  const meterForm = useForm<z.input<typeof meterSchema>, any, z.output<typeof meterSchema>>({
    resolver: zodResolver(meterSchema),
    defaultValues: { meterType: "", readingDate: new Date().toLocaleDateString("sv-SE") },
  });
  const wasteForm = useForm<z.input<typeof wasteSchema>, any, z.output<typeof wasteSchema>>({
    resolver: zodResolver(wasteSchema),
    defaultValues: { category: "", registrationDate: new Date().toLocaleDateString("sv-SE") },
  });
  const correctForm = useForm<z.input<typeof correctSchema>, any, z.output<typeof correctSchema>>({
    resolver: zodResolver(correctSchema),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/meter-readings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/waste-registrations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sustainability/report"] });
  };

  const openEditDialog = (r: MeterReading) => {
    setEditReading(r);
    correctForm.reset({ readingDate: r.readingDate, value: r.value });
  };

  const onSubmitCorrect = (values: z.output<typeof correctSchema>) => {
    if (!editReading) return;
    updateReading.mutate({ id: editReading.id, data: values }, {
      onSuccess: () => {
        toast({ title: "Meterstand gecorrigeerd" });
        setEditReading(null);
        invalidate();
      },
      onError: () => toast({ title: "Correctie mislukt", variant: "destructive" }),
    });
  };

  const onConfirmDelete = () => {
    if (!deleteReading) return;
    doDeleteReading.mutate({ id: deleteReading.id }, {
      onSuccess: () => {
        toast({ title: "Meterstand verwijderd" });
        setDeleteReading(null);
        invalidate();
      },
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    });
  };

  const onSubmitMeter = (values: z.output<typeof meterSchema>) => {
    const unit = METER_TYPES.find((t) => t.value === values.meterType)!.unit;
    createReading.mutate({ data: { ...values, unit } }, {
      onSuccess: () => {
        toast({ title: "Meterstand geregistreerd" });
        setMeterDialogOpen(false);
        meterForm.reset({ meterType: "", readingDate: new Date().toLocaleDateString("sv-SE") });
        invalidate();
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    });
  };

  const onSubmitWaste = (values: z.output<typeof wasteSchema>) => {
    createWaste.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: "Afvalregistratie opgeslagen" });
        setWasteDialogOpen(false);
        wasteForm.reset({ category: "", registrationDate: new Date().toLocaleDateString("sv-SE") });
        invalidate();
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    });
  };

  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    const required = ["gebouw", "type", "datum", "stand"];
    if (!required.every((h) => headers.includes(h))) {
      toast({
        title: "Ongeldig CSV-formaat",
        description: "Verwachte kolommen: gebouw;type;datum;stand (datum als JJJJ-MM-DD).",
        variant: "destructive",
      });
      return;
    }
    const idx = (h: string) => headers.indexOf(h);
    const byName = new Map(buildings.map((b) => [b.name.toLowerCase(), b.id]));
    const parsedRows: { buildingId: number; meterType: string; readingDate: string; value: number; unit: string }[] = [];
    let unmatched = 0;
    for (const row of rows) {
      const buildingId = byName.get((row[idx("gebouw")] ?? "").toLowerCase());
      const meterType = (row[idx("type")] ?? "").toLowerCase();
      const typeDef = METER_TYPES.find((t) => t.value === meterType);
      const value = Number((row[idx("stand")] ?? "").replace(",", "."));
      if (!buildingId || !typeDef || Number.isNaN(value)) {
        unmatched++;
        continue;
      }
      parsedRows.push({ buildingId, meterType, readingDate: row[idx("datum")] ?? "", value, unit: typeDef.unit });
    }
    if (!parsedRows.length) {
      toast({ title: "Geen geldige rijen gevonden in het CSV-bestand", variant: "destructive" });
      return;
    }
    importReadings.mutate({ data: { rows: parsedRows } }, {
      onSuccess: (result) => {
        toast({
          title: "CSV-import voltooid",
          description: `${result.message}${unmatched ? ` (${unmatched} rijen niet herkend)` : ""}`,
        });
        invalidate();
      },
      onError: () => toast({ title: "Import mislukt", variant: "destructive" }),
    });
  };

  const exportCsv = () => {
    if (!report) return;

    const rows: string[] = [];

    // Section 1: monthly energy / water usage
    rows.push("# Maandelijks verbruik");
    rows.push("maand;type;verbruik;eenheid");
    for (const u of report.monthlyUsage) {
      rows.push(`${u.month};${u.meterType};${u.usage.toString().replace(".", ",")};${u.unit}`);
    }

    rows.push(""); // blank separator

    // Section 2: waste by month and category
    rows.push("# Afval per maand");
    rows.push("maand;categorie;gewicht_kg");
    for (const w of report.wasteByMonth) {
      rows.push(`${w.month};${w.category};${w.totalKg.toString().replace(".", ",")}`);
    }

    rows.push(""); // blank separator

    // Section 3: waste totals by category
    rows.push("# Afval totaal per categorie");
    rows.push("categorie;totaal_kg");
    for (const w of report.wasteByCategory) {
      rows.push(`${w.category};${w.totalKg.toString().replace(".", ",")}`);
    }

    const activeBuildingName = buildings.find((b) => b.id === Number(filterBuildingId))?.name;
    const filename = buildExportFilename(activeBuildingName, filterDateFrom, filterDateTo);

    const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentYear = new Date().getFullYear();

  const hasActiveFilters = filterBuildingId || filterDateFrom || filterDateTo;

  // True when the API responded but every array is empty — the filter matched nothing.
  const isReportEmpty = report !== undefined
    && report.monthlyUsage.length === 0
    && report.wasteByCategory.length === 0
    && report.wasteByMonth.length === 0;

  const clearFilters = () => {
    // Cancel any pending debounced PUT so it cannot fire after the DELETE.
    if (putDebounceRef.current) { clearTimeout(putDebounceRef.current); putDebounceRef.current = null; }
    // Bump generation so any already-dispatched async PUT knows to discard its result.
    generationRef.current += 1;
    userHasUnsavedChanges.current = false;
    setFilterBuildingIdRaw("");
    setFilterDateFromRaw("");
    setFilterDateToRaw("");
    deletePref.mutate(
      { key: FILTER_KEY },
      { onSuccess: () => { bcRef.current?.postMessage({ type: "update", value: null }); } },
    );
  };

  // Chart data: pivot monthlyUsage naar per-maand rijen per type
  const usageChart = useMemo(() => {
    const months = new Map<string, Record<string, number | string>>();
    for (const u of report?.monthlyUsage ?? []) {
      if (!months.has(u.month)) months.set(u.month, { month: u.month });
      months.get(u.month)![u.meterType] = u.usage;
    }
    return Array.from(months.values());
  }, [report]);

  const wasteMonthChart = useMemo(() => {
    const months = new Map<string, Record<string, number | string>>();
    for (const w of report?.wasteByMonth ?? []) {
      if (!months.has(w.month)) months.set(w.month, { month: w.month });
      months.get(w.month)![w.category] = w.totalKg;
    }
    return Array.from(months.values());
  }, [report]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Duurzaamheid</h1>
          <p className="text-muted-foreground">Energie-, gas- en waterverbruik plus afvalregistratie en rapportages.</p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCsvFile(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importReadings.isPending}>
            {importReadings.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            CSV importeren
          </Button>
        </div>
      </div>

      <Tabs defaultValue="rapportage">
        <TabsList>
          <TabsTrigger value="rapportage">Rapportage</TabsTrigger>
          <TabsTrigger value="meterstanden">Meterstanden</TabsTrigger>
          <TabsTrigger value="afval">Afvalregistratie</TabsTrigger>
        </TabsList>

        <TabsContent value="rapportage" className="space-y-6 pt-4">
          {/* Filter bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
                  <Filter className="h-4 w-4" />
                  Filteren op
                </div>

                {/* Building filter */}
                <div className="min-w-[180px] flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">Gebouw</label>
                  <Select
                    value={filterBuildingId || "__all__"}
                    onValueChange={(v) => setFilterBuildingId(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Alle gebouwen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Alle gebouwen</SelectItem>
                      {buildings.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date from */}
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Van</label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                  />
                </div>

                {/* Date to */}
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Tot en met</label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                  />
                </div>

                {/* Clear + Export buttons */}
                <div className="flex items-end gap-2 ml-auto">
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs">
                      <X className="h-3 w-3 mr-1" />
                      Filters wissen
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={exportCsv}
                    disabled={!report || isReportEmpty}
                    title={isReportEmpty ? "Geen data om te exporteren voor de geselecteerde filters" : undefined}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Exporteer CSV
                  </Button>
                </div>
              </div>

              {/* Quarter shortcuts */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className="text-xs text-muted-foreground shrink-0 mr-1">Kwartaal:</span>
                {[currentYear, currentYear - 1].flatMap((year) =>
                  ([1, 2, 3, 4] as const).map((q) => {
                    const range = getQuarterRange(year, q);
                    const isActive = filterDateFrom === range.from && filterDateTo === range.to;
                    return (
                      <Button
                        key={`${year}-Q${q}`}
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          setFilterDateFrom(range.from);
                          setFilterDateTo(range.to);
                        }}
                      >
                        Q{q} {year}
                      </Button>
                    );
                  })
                )}
              </div>

              {/* Active filter badges */}
              {hasActiveFilters && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                  {filterBuildingId && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      Gebouw: {buildings.find((b) => b.id === Number(filterBuildingId))?.name ?? filterBuildingId}
                      <button onClick={() => setFilterBuildingId("")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {filterDateFrom && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      Van: {filterDateFrom}
                      <button onClick={() => setFilterDateFrom("")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {filterDateTo && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      T/m: {filterDateTo}
                      <button onClick={() => setFilterDateTo("")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Empty-state banner when filters match no data */}
          {isReportEmpty && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground/40" />
                <p className="text-base font-medium text-muted-foreground">Geen data voor dit gebouw en deze periode</p>
                <p className="text-sm text-muted-foreground/70">
                  Pas de filters aan of{" "}
                  <button className="underline underline-offset-2 hover:text-foreground transition-colors" onClick={clearFilters}>
                    wis alle filters
                  </button>{" "}
                  om alle beschikbare gegevens te tonen.
                </p>
              </CardContent>
            </Card>
          )}

          <div className={isReportEmpty ? "hidden" : "grid gap-6 lg:grid-cols-2"}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" />Maandelijks verbruik</CardTitle>
                <CardDescription>Elektriciteit (kWh), gas en water (m³) — alle gebouwen</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <ChartTooltip />
                    <Legend />
                    <Bar dataKey="elektriciteit" name="Elektriciteit (kWh)" fill={TYPE_COLORS.elektriciteit} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="gas" name="Gas (m³)" fill={TYPE_COLORS.gas} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="water" name="Water (m³)" fill={TYPE_COLORS.water} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Trash2 className="h-4 w-4 text-primary" />Afval per categorie</CardTitle>
                <CardDescription>Totaal geregistreerd gewicht (kg)</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={report?.wasteByCategory ?? []} dataKey="totalKg" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e: any) => e.category}>
                      {(report?.wasteByCategory ?? []).map((w) => (
                        <Cell key={w.category} fill={WASTE_COLORS[w.category] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <ChartTooltip formatter={(v: any) => `${v} kg`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className={isReportEmpty ? "hidden" : ""}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Leaf className="h-4 w-4 text-primary" />Afval per maand</CardTitle>
              <CardDescription>Gewicht per categorie per maand (kg)</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wasteMonthChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <ChartTooltip formatter={(v: any) => `${v} kg`} />
                  <Legend />
                  {WASTE_CATEGORIES.map((c) => (
                    <Bar key={c} dataKey={c} name={c} stackId="waste" fill={WASTE_COLORS[c]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meterstanden" className="space-y-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              CSV-formaat: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">gebouw;type;datum;stand</code> — bijv. <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Stadhuis;elektriciteit;2026-08-01;210500</code>
            </p>
            <Dialog open={meterDialogOpen} onOpenChange={setMeterDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Meterstand invoeren</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Meterstand registreren</DialogTitle>
                  <DialogDescription>Voer de cumulatieve meterstand in.</DialogDescription>
                </DialogHeader>
                <Form {...meterForm}>
                  <form onSubmit={meterForm.handleSubmit(onSubmitMeter)} className="space-y-4">
                    <FormField control={meterForm.control} name="buildingId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gebouw</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Kies gebouw" /></SelectTrigger></FormControl>
                          <SelectContent>{buildings.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={meterForm.control} name="meterType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Metertype</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Kies type" /></SelectTrigger></FormControl>
                          <SelectContent>{METER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label} ({t.unit})</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={meterForm.control} name="readingDate" render={({ field }) => (
                        <FormItem><FormLabel>Datum</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={meterForm.control} name="value" render={({ field }) => (
                        <FormItem><FormLabel>Meterstand</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={(field.value as any) ?? ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setMeterDialogOpen(false)}>Annuleren</Button>
                      <Button type="submit" disabled={createReading.isPending}>
                        {createReading.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Gebouw</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Stand</TableHead>
                    <TableHead>Bron</TableHead>
                    <TableHead>Geregistreerd door</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readings?.slice(0, 40).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.readingDate}</TableCell>
                      <TableCell>{r.buildingName}</TableCell>
                      <TableCell className="capitalize">{r.meterType}</TableCell>
                      <TableCell className="text-right font-mono">{r.value.toLocaleString("nl-NL")} {r.unit}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{r.source === "csv_import" ? "CSV-import" : "Handmatig"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.registeredByName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(r)} title="Corrigeren">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteReading(r)} title="Verwijderen">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="afval" className="space-y-4 pt-4">
          <div className="flex justify-end">
            <Dialog open={wasteDialogOpen} onOpenChange={setWasteDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Afval registreren</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Afvalregistratie</DialogTitle>
                  <DialogDescription>Registreer opgehaald afval per categorie.</DialogDescription>
                </DialogHeader>
                <Form {...wasteForm}>
                  <form onSubmit={wasteForm.handleSubmit(onSubmitWaste)} className="space-y-4">
                    <FormField control={wasteForm.control} name="buildingId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gebouw</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Kies gebouw" /></SelectTrigger></FormControl>
                          <SelectContent>{buildings.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={wasteForm.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Categorie</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Kies categorie" /></SelectTrigger></FormControl>
                          <SelectContent>{WASTE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={wasteForm.control} name="registrationDate" render={({ field }) => (
                        <FormItem><FormLabel>Datum</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={wasteForm.control} name="weightKg" render={({ field }) => (
                        <FormItem><FormLabel>Gewicht (kg)</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={(field.value as any) ?? ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setWasteDialogOpen(false)}>Annuleren</Button>
                      <Button type="submit" disabled={createWaste.isPending}>
                        {createWaste.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Gebouw</TableHead>
                    <TableHead>Categorie</TableHead>
                    <TableHead className="text-right">Gewicht</TableHead>
                    <TableHead>Geregistreerd door</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waste?.slice(0, 40).map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>{w.registrationDate}</TableCell>
                      <TableCell>{w.buildingName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize border-transparent" style={{ backgroundColor: `${WASTE_COLORS[w.category]}22`, color: WASTE_COLORS[w.category] }}>
                          {w.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{w.weightKg.toLocaleString("nl-NL")} kg</TableCell>
                      <TableCell className="text-muted-foreground">{w.registeredByName ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit/correct dialog */}
      <Dialog open={!!editReading} onOpenChange={(open) => { if (!open) setEditReading(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Meterstand corrigeren</DialogTitle>
            <DialogDescription>
              {editReading ? `${editReading.buildingName} — ${editReading.meterType}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Form {...correctForm}>
            <form onSubmit={correctForm.handleSubmit(onSubmitCorrect)} className="space-y-4">
              <FormField control={correctForm.control} name="readingDate" render={({ field }) => (
                <FormItem><FormLabel>Datum</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={correctForm.control} name="value" render={({ field }) => (
                <FormItem>
                  <FormLabel>Meterstand ({editReading?.unit})</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} value={(field.value as any) ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditReading(null)}>Annuleren</Button>
                <Button type="submit" disabled={updateReading.isPending}>
                  {updateReading.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteReading} onOpenChange={(open) => { if (!open) setDeleteReading(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Meterstand verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteReading
                ? `Stand van ${deleteReading.value.toLocaleString("nl-NL")} ${deleteReading.unit} op ${deleteReading.readingDate} voor ${deleteReading.buildingName} wordt permanent verwijderd. Verbruiksberekeningen worden direct herberekend.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirmDelete}
              disabled={doDeleteReading.isPending}
            >
              {doDeleteReading.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
