import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "@/i18n";
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
  useUpdateWasteRegistration,
  useDeleteWasteRegistration,
  useGetSustainabilityReport,
  type MeterReading,
  type WasteRegistration,
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
  { value: "elektriciteit", unit: "kWh" },
  { value: "gas", unit: "m3" },
  { value: "water", unit: "m3" },
];

type TFn = (key: string, options?: any) => string;
const WASTE_CATEGORIES = ["restafval", "papier", "gft", "plastic", "glas", "chemisch"];
const WASTE_COLORS: Record<string, string> = {
  restafval: "#64748b", papier: "#2563eb", gft: "#16a34a", plastic: "#ea580c", glas: "#0891b2", chemisch: "#dc2626",
};
const TYPE_COLORS: Record<string, string> = { elektriciteit: "#eab308", gas: "#f97316", water: "#0ea5e9" };

const makeMeterSchema = (t: TFn) => z.object({
  buildingId: z.number({ message: t("validation.buildingRequired") }),
  meterType: z.string().min(1, t("validation.meterTypeRequired")),
  readingDate: z.string().min(10, t("validation.dateRequired")),
  value: z.coerce.number().min(0, t("validation.readingRequired")),
});
type MeterSchema = ReturnType<typeof makeMeterSchema>;

const makeCorrectSchema = (t: TFn) => z.object({
  readingDate: z.string().min(10, t("validation.dateRequired")),
  value: z.coerce.number().min(0, t("validation.readingRequired")),
});
type CorrectSchema = ReturnType<typeof makeCorrectSchema>;

const makeWasteSchema = (t: TFn) => z.object({
  buildingId: z.number({ message: t("validation.buildingRequired") }),
  registrationDate: z.string().min(10, t("validation.dateRequired")),
  category: z.string().min(1, t("validation.categoryRequired")),
  weightKg: z.coerce.number().min(0.1, t("validation.weightRequired")),
});
type WasteSchema = ReturnType<typeof makeWasteSchema>;

const makeWasteCorrectSchema = (t: TFn) => z.object({
  registrationDate: z.string().min(10, t("validation.dateRequired")),
  category: z.string().min(1, t("validation.categoryRequired")),
  weightKg: z.coerce.number().min(0.1, t("validation.weightRequired")),
});
type WasteCorrectSchema = ReturnType<typeof makeWasteCorrectSchema>;
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
  const { t } = useTranslation("duurzaamheid");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const meterSchema = useMemo(() => makeMeterSchema(t), [t]);
  const correctSchema = useMemo(() => makeCorrectSchema(t), [t]);
  const wasteSchema = useMemo(() => makeWasteSchema(t), [t]);
  const wasteCorrectSchema = useMemo(() => makeWasteCorrectSchema(t), [t]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [wasteDialogOpen, setWasteDialogOpen] = useState(false);
  const [editReading, setEditReading] = useState<MeterReading | null>(null);
  const [deleteReading, setDeleteReading] = useState<MeterReading | null>(null);
  const [editWaste, setEditWaste] = useState<WasteRegistration | null>(null);
  const [deleteWaste, setDeleteWaste] = useState<WasteRegistration | null>(null);

  // Filter state for the rapportage tab — initialised from localStorage
  const FILTER_KEY = "duurzaamheid_report_filters";
  const storedFilters = useMemo(() => {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      return raw ? (JSON.parse(raw) as { buildingId?: string; dateFrom?: string; dateTo?: string }) : {};
    } catch {
      return {};
    }
  }, []);
  const [filterBuildingId, setFilterBuildingIdRaw] = useState<string>(storedFilters.buildingId ?? "");
  const [filterDateFrom, setFilterDateFromRaw] = useState<string>(storedFilters.dateFrom ?? "");
  const [filterDateTo, setFilterDateToRaw] = useState<string>(storedFilters.dateTo ?? "");

  const persistFilters = (buildingId: string, dateFrom: string, dateTo: string) => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify({ buildingId, dateFrom, dateTo }));
    } catch {
      // ignore storage errors
    }
  };

  const setFilterBuildingId = (v: string) => {
    setFilterBuildingIdRaw(v);
    persistFilters(v, filterDateFrom, filterDateTo);
  };
  const setFilterDateFrom = (v: string) => {
    setFilterDateFromRaw(v);
    persistFilters(filterBuildingId, v, filterDateTo);
  };
  const setFilterDateTo = (v: string) => {
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
  const updateWaste = useUpdateWasteRegistration();
  const doDeleteWaste = useDeleteWasteRegistration();

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

  const wasteCorrectForm = useForm<z.input<typeof wasteCorrectSchema>, any, z.output<typeof wasteCorrectSchema>>({
    resolver: zodResolver(wasteCorrectSchema),
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

  const openEditWasteDialog = (w: WasteRegistration) => {
    setEditWaste(w);
    wasteCorrectForm.reset({ registrationDate: w.registrationDate, category: w.category, weightKg: w.weightKg });
  };

  const onSubmitWasteCorrect = (values: z.output<typeof wasteCorrectSchema>) => {
    if (!editWaste) return;
    updateWaste.mutate({ id: editWaste.id, data: values }, {
      onSuccess: () => {
        toast({ title: t("toast.wasteCorrected") });
        setEditWaste(null);
        invalidate();
      },
      onError: () => toast({ title: t("toast.correctFailed"), variant: "destructive" }),
    });
  };

  const onConfirmDeleteWaste = () => {
    if (!deleteWaste) return;
    doDeleteWaste.mutate({ id: deleteWaste.id }, {
      onSuccess: () => {
        toast({ title: t("toast.wasteDeleted") });
        setDeleteWaste(null);
        invalidate();
      },
      onError: () => toast({ title: t("toast.deleteFailed"), variant: "destructive" }),
    });
  };

  const onSubmitCorrect = (values: z.output<typeof correctSchema>) => {
    if (!editReading) return;
    updateReading.mutate({ id: editReading.id, data: values }, {
      onSuccess: () => {
        toast({ title: t("toast.readingCorrected") });
        setEditReading(null);
        invalidate();
      },
      onError: () => toast({ title: t("toast.correctFailed"), variant: "destructive" }),
    });
  };

  const onConfirmDelete = () => {
    if (!deleteReading) return;
    doDeleteReading.mutate({ id: deleteReading.id }, {
      onSuccess: () => {
        toast({ title: t("toast.readingDeleted") });
        setDeleteReading(null);
        invalidate();
      },
      onError: () => toast({ title: t("toast.deleteFailed"), variant: "destructive" }),
    });
  };

  const onSubmitMeter = (values: z.output<typeof meterSchema>) => {
    const unit = METER_TYPES.find((t) => t.value === values.meterType)!.unit;
    createReading.mutate({ data: { ...values, unit } }, {
      onSuccess: () => {
        toast({ title: t("toast.readingRegistered") });
        setMeterDialogOpen(false);
        meterForm.reset({ meterType: "", readingDate: new Date().toLocaleDateString("sv-SE") });
        invalidate();
      },
      onError: () => toast({ title: t("toast.saveFailed"), variant: "destructive" }),
    });
  };

  const onSubmitWaste = (values: z.output<typeof wasteSchema>) => {
    createWaste.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: t("toast.wasteSaved") });
        setWasteDialogOpen(false);
        wasteForm.reset({ category: "", registrationDate: new Date().toLocaleDateString("sv-SE") });
        invalidate();
      },
      onError: () => toast({ title: t("toast.saveFailed"), variant: "destructive" }),
    });
  };

  const handleCsvFile = async (file: File) => {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    const required = ["gebouw", "type", "datum", "stand"];
    if (!required.every((h) => headers.includes(h))) {
      toast({
        title: t("toast.invalidCsvTitle"),
        description: t("toast.invalidCsvDescription"),
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
      toast({ title: t("toast.noValidRows"), variant: "destructive" });
      return;
    }
    importReadings.mutate({ data: { rows: parsedRows } }, {
      onSuccess: (result) => {
        toast({
          title: t("toast.importDone"),
          description: unmatched ? t("toast.importUnmatched", { message: result.message, count: unmatched }) : result.message,
        });
        invalidate();
      },
      onError: () => toast({ title: t("toast.importFailed"), variant: "destructive" }),
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
    setFilterBuildingIdRaw("");
    setFilterDateFromRaw("");
    setFilterDateToRaw("");
    try { localStorage.removeItem(FILTER_KEY); } catch { /* ignore */ }
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
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
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
            {t("importCsv")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="rapportage">
        <TabsList>
          <TabsTrigger value="rapportage">{t("tabs.report")}</TabsTrigger>
          <TabsTrigger value="meterstanden">{t("tabs.meters")}</TabsTrigger>
          <TabsTrigger value="afval">{t("tabs.waste")}</TabsTrigger>
        </TabsList>

        <TabsContent value="rapportage" className="space-y-6 pt-4">
          {/* Filter bar */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground shrink-0">
                  <Filter className="h-4 w-4" />
                  {t("filter.label")}
                </div>

                {/* Building filter */}
                <div className="min-w-[180px] flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">{t("filter.building")}</label>
                  <Select
                    value={filterBuildingId || "__all__"}
                    onValueChange={(v) => setFilterBuildingId(v === "__all__" ? "" : v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder={t("filter.allBuildings")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("filter.allBuildings")}</SelectItem>
                      {buildings.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date from */}
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">{t("filter.from")}</label>
                  <Input
                    type="date"
                    className="h-8 text-sm"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                  />
                </div>

                {/* Date to */}
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground mb-1 block">{t("filter.to")}</label>
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
                      {t("filter.clear")}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={exportCsv}
                    disabled={!report || isReportEmpty}
                    title={isReportEmpty ? t("filter.exportEmptyTitle") : undefined}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t("filter.exportCsv")}
                  </Button>
                </div>
              </div>

              {/* Quarter shortcuts */}
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className="text-xs text-muted-foreground shrink-0 mr-1">{t("filter.quarter")}</span>
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
                      {t("filter.badgeBuilding", { value: buildings.find((b) => b.id === Number(filterBuildingId))?.name ?? filterBuildingId })}
                      <button onClick={() => setFilterBuildingId("")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {filterDateFrom && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      {t("filter.badgeFrom", { value: filterDateFrom })}
                      <button onClick={() => setFilterDateFrom("")} className="ml-1 hover:text-foreground"><X className="h-3 w-3" /></button>
                    </Badge>
                  )}
                  {filterDateTo && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      {t("filter.badgeTo", { value: filterDateTo })}
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
                <p className="text-base font-medium text-muted-foreground">{t("empty.title")}</p>
                <p className="text-sm text-muted-foreground/70">
                  {t("empty.hintPrefix")}
                  <button className="underline underline-offset-2 hover:text-foreground transition-colors" onClick={clearFilters}>
                    {t("empty.hintLink")}
                  </button>
                  {t("empty.hintSuffix")}
                </p>
              </CardContent>
            </Card>
          )}

          <div className={isReportEmpty ? "hidden" : "grid gap-6 lg:grid-cols-2"}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" />{t("charts.monthlyUsage")}</CardTitle>
                <CardDescription>{t("charts.monthlyUsageDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageChart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} />
                    <ChartTooltip />
                    <Legend />
                    <Bar dataKey="elektriciteit" name={t("charts.electricity")} fill={TYPE_COLORS.elektriciteit} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="gas" name={t("charts.gas")} fill={TYPE_COLORS.gas} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="water" name={t("charts.water")} fill={TYPE_COLORS.water} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Trash2 className="h-4 w-4 text-primary" />{t("charts.wasteByCategory")}</CardTitle>
                <CardDescription>{t("charts.wasteByCategoryDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={report?.wasteByCategory ?? []} dataKey="totalKg" nameKey="category" innerRadius={55} outerRadius={90} paddingAngle={2} label={(e: any) => t(`wasteCategory.${e.category}`, { defaultValue: e.category })}>
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
              <CardTitle className="text-base flex items-center gap-2"><Leaf className="h-4 w-4 text-primary" />{t("charts.wasteByMonth")}</CardTitle>
              <CardDescription>{t("charts.wasteByMonthDescription")}</CardDescription>
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
                    <Bar key={c} dataKey={c} name={t(`wasteCategory.${c}`, { defaultValue: c })} stackId="waste" fill={WASTE_COLORS[c]} />
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
              {t("meters.csvFormat")} <code className="bg-muted px-1.5 py-0.5 rounded text-xs">gebouw;type;datum;stand</code> {t("meters.csvExample")} <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Stadhuis;elektriciteit;2026-08-01;210500</code>
            </p>
            <Dialog open={meterDialogOpen} onOpenChange={setMeterDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />{t("meters.addReading")}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("meters.registerTitle")}</DialogTitle>
                  <DialogDescription>{t("meters.registerDescription")}</DialogDescription>
                </DialogHeader>
                <Form {...meterForm}>
                  <form onSubmit={meterForm.handleSubmit(onSubmitMeter)} className="space-y-4">
                    <FormField control={meterForm.control} name="buildingId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("meters.building")}</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder={t("meters.buildingPlaceholder")} /></SelectTrigger></FormControl>
                          <SelectContent>{buildings.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={meterForm.control} name="meterType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("meters.type")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder={t("meters.typePlaceholder")} /></SelectTrigger></FormControl>
                          <SelectContent>{METER_TYPES.map((mt) => <SelectItem key={mt.value} value={mt.value}>{t(`meterType.${mt.value}`)} ({mt.unit})</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={meterForm.control} name="readingDate" render={({ field }) => (
                        <FormItem><FormLabel>{t("meters.date")}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={meterForm.control} name="value" render={({ field }) => (
                        <FormItem><FormLabel>{t("meters.reading")}</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={(field.value as any) ?? ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setMeterDialogOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                      <Button type="submit" disabled={createReading.isPending}>
                        {createReading.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save", { ns: "common" })}
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
                    <TableHead>{t("meters.table.date")}</TableHead>
                    <TableHead>{t("meters.table.building")}</TableHead>
                    <TableHead>{t("meters.table.type")}</TableHead>
                    <TableHead className="text-right">{t("meters.table.reading")}</TableHead>
                    <TableHead>{t("meters.table.source")}</TableHead>
                    <TableHead>{t("meters.table.registeredBy")}</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readings?.slice(0, 40).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.readingDate}</TableCell>
                      <TableCell>{r.buildingName}</TableCell>
                      <TableCell>{t(`meterType.${r.meterType}`, { defaultValue: r.meterType })}</TableCell>
                      <TableCell className="text-right font-mono">{r.value.toLocaleString(getIntlLocale())} {r.unit}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{r.source === "csv_import" ? t("meters.source.csvImport") : t("meters.source.manual")}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.registeredByName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(r)} title={t("actions.correct")}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteReading(r)} title={t("actions.delete")}>
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
                <Button><Plus className="mr-2 h-4 w-4" />{t("waste.add")}</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{t("waste.title")}</DialogTitle>
                  <DialogDescription>{t("waste.description")}</DialogDescription>
                </DialogHeader>
                <Form {...wasteForm}>
                  <form onSubmit={wasteForm.handleSubmit(onSubmitWaste)} className="space-y-4">
                    <FormField control={wasteForm.control} name="buildingId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("waste.building")}</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                          <FormControl><SelectTrigger><SelectValue placeholder={t("waste.buildingPlaceholder")} /></SelectTrigger></FormControl>
                          <SelectContent>{buildings.map((b) => <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={wasteForm.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("waste.category")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder={t("waste.categoryPlaceholder")} /></SelectTrigger></FormControl>
                          <SelectContent>{WASTE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`wasteCategory.${c}`)}</SelectItem>)}</SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={wasteForm.control} name="registrationDate" render={({ field }) => (
                        <FormItem><FormLabel>{t("waste.date")}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={wasteForm.control} name="weightKg" render={({ field }) => (
                        <FormItem><FormLabel>{t("waste.weight")}</FormLabel><FormControl><Input type="number" step="0.1" {...field} value={(field.value as any) ?? ""} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setWasteDialogOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                      <Button type="submit" disabled={createWaste.isPending}>
                        {createWaste.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save", { ns: "common" })}
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
                    <TableHead>{t("waste.table.date")}</TableHead>
                    <TableHead>{t("waste.table.building")}</TableHead>
                    <TableHead>{t("waste.table.category")}</TableHead>
                    <TableHead className="text-right">{t("waste.table.weight")}</TableHead>
                    <TableHead>{t("waste.table.registeredBy")}</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waste?.slice(0, 40).map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>{w.registrationDate}</TableCell>
                      <TableCell>{w.buildingName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="border-transparent" style={{ backgroundColor: `${WASTE_COLORS[w.category]}22`, color: WASTE_COLORS[w.category] }}>
                          {t(`wasteCategory.${w.category}`, { defaultValue: w.category })}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{w.weightKg.toLocaleString(getIntlLocale())} kg</TableCell>
                      <TableCell className="text-muted-foreground">{w.registeredByName ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditWasteDialog(w)} title={t("actions.correct")}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteWaste(w)} title={t("actions.delete")}>
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
      </Tabs>

      {/* Edit/correct dialog */}
      <Dialog open={!!editReading} onOpenChange={(open) => { if (!open) setEditReading(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("meters.correctTitle")}</DialogTitle>
            <DialogDescription>
              {editReading ? `${editReading.buildingName} — ${t(`meterType.${editReading.meterType}`, { defaultValue: editReading.meterType })}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Form {...correctForm}>
            <form onSubmit={correctForm.handleSubmit(onSubmitCorrect)} className="space-y-4">
              <FormField control={correctForm.control} name="readingDate" render={({ field }) => (
                <FormItem><FormLabel>{t("meters.date")}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={correctForm.control} name="value" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("meters.readingWithUnit", { unit: editReading?.unit })}</FormLabel>
                  <FormControl><Input type="number" step="0.01" {...field} value={(field.value as any) ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditReading(null)}>{t("common.cancel", { ns: "common" })}</Button>
                <Button type="submit" disabled={updateReading.isPending}>
                  {updateReading.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save", { ns: "common" })}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — meter reading */}
      <AlertDialog open={!!deleteReading} onOpenChange={(open) => { if (!open) setDeleteReading(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("meters.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteReading
                ? t("meters.deleteBody", { value: deleteReading.value.toLocaleString(getIntlLocale()), unit: deleteReading.unit, date: deleteReading.readingDate, building: deleteReading.buildingName })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { ns: "common" })}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirmDelete}
              disabled={doDeleteReading.isPending}
            >
              {doDeleteReading.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit/correct dialog — waste registration */}
      <Dialog open={!!editWaste} onOpenChange={(open) => { if (!open) setEditWaste(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("waste.correctTitle")}</DialogTitle>
            <DialogDescription>
              {editWaste ? `${editWaste.buildingName} — ${editWaste.registrationDate}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Form {...wasteCorrectForm}>
            <form onSubmit={wasteCorrectForm.handleSubmit(onSubmitWasteCorrect)} className="space-y-4">
              <FormField control={wasteCorrectForm.control} name="registrationDate" render={({ field }) => (
                <FormItem><FormLabel>{t("waste.date")}</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={wasteCorrectForm.control} name="category" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("waste.category")}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder={t("waste.categoryPlaceholder")} /></SelectTrigger></FormControl>
                    <SelectContent>{WASTE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`wasteCategory.${c}`)}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={wasteCorrectForm.control} name="weightKg" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("waste.weight")}</FormLabel>
                  <FormControl><Input type="number" step="0.1" {...field} value={(field.value as any) ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditWaste(null)}>{t("common.cancel", { ns: "common" })}</Button>
                <Button type="submit" disabled={updateWaste.isPending}>
                  {updateWaste.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save", { ns: "common" })}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation — waste registration */}
      <AlertDialog open={!!deleteWaste} onOpenChange={(open) => { if (!open) setDeleteWaste(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("waste.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteWaste
                ? t("waste.deleteBody", { weight: deleteWaste.weightKg.toLocaleString(getIntlLocale()), category: t(`wasteCategory.${deleteWaste.category}`, { defaultValue: deleteWaste.category }), date: deleteWaste.registrationDate, building: deleteWaste.buildingName })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", { ns: "common" })}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirmDeleteWaste}
              disabled={doDeleteWaste.isPending}
            >
              {doDeleteWaste.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
