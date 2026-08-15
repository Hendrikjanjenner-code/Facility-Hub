import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetStructure,
  useListMeterReadings,
  useCreateMeterReading,
  useImportMeterReadings,
  useListWasteRegistrations,
  useCreateWasteRegistration,
  useGetSustainabilityReport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Leaf, Plus, Upload, Loader2, Gauge, Trash2, FileSpreadsheet, Download } from "lucide-react";
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

export default function DuurzaamheidPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [meterDialogOpen, setMeterDialogOpen] = useState(false);
  const [wasteDialogOpen, setWasteDialogOpen] = useState(false);

  const { data: structure } = useGetStructure();
  const buildings = useMemo(
    () => (structure ?? []).flatMap((org) => org.sites.flatMap((s) => s.buildings.map((b) => ({ id: b.id, name: b.name })))),
    [structure],
  );

  const { data: readings } = useListMeterReadings();
  const { data: waste } = useListWasteRegistrations();
  const { data: report } = useGetSustainabilityReport();
  const createReading = useCreateMeterReading();
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/meter-readings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/waste-registrations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sustainability/report"] });
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

    const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `duurzaamheidsrapportage_${new Date().toLocaleDateString("sv-SE")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportCsv} disabled={!report}>
              <Download className="mr-2 h-4 w-4" />
              Exporteer CSV
            </Button>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
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

          <Card>
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
    </div>
  );
}
