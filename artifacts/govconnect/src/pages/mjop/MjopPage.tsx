import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListBouwdelen,
  useCreateBouwdeel,
  useListMjopTaken,
  useCreateMjopTaak,
  useConvertMjopTaakToTicket,
  useGetJaarplanning,
  useGetStructure,
  useGetCurrentUser,
  useListKostenKengetallen,
} from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wrench,
  Search,
  Plus,
  Loader2,
  Building2,
  CalendarRange,
  Ticket,
  Euro,
  ListChecks,
  BookOpen,
  TrendingUp,
  Pencil,
  Trash2,
  CheckCircle2,
  Circle,
  CalendarDays,
  AlertTriangle,
  ShieldAlert,
  Info,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  scoreColor,
  scoreLabel,
  taakStatusColor,
  taakStatusLabel,
  TAAK_TYPES,
  CATEGORIES,
  NL_SFB_CODES,
  euro,
} from "./mjop-helpers";

const API_BASE = "/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type KostenKengetal = {
  id: number;
  name: string;
  category: string;
  nlSfbCode?: string | null;
  unit: string;
  pricePerUnit: number;
  notes?: string | null;
  createdAt: string;
};

type MjopScenario = {
  id: number;
  name: string;
  type: string;
  description?: string | null;
  buildingId?: number | null;
  isActive: boolean;
  createdAt: string;
};

type BegrotingEntry = {
  year: number;
  totalCost: number;
  taken: Array<{
    bouwdeelId: number;
    bouwdeelCode: string;
    bouwdeelName: string;
    buildingName?: string | null;
    taskType: string;
    cost: number;
    reason: string;
  }>;
};

// ── Hooks (direct fetch, not generated) ──────────────────────────────────────

function useKengetallen() {
  return useQuery<KostenKengetal[]>({
    queryKey: ["/api/mjop/kengetallen"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/mjop/kengetallen`, { credentials: "include" });
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<KostenKengetal[]>;
    },
  });
}

function useCreateKengetal(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<KostenKengetal, "id" | "createdAt">) => {
      const r = await fetch(`${API_BASE}/mjop/kengetallen`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Opslaan mislukt");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mjop/kengetallen"] });
      onDone();
    },
  });
}

function useUpdateKengetal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<KostenKengetal> & { id: number }) => {
      const r = await fetch(`${API_BASE}/mjop/kengetallen/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Bijwerken mislukt");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mjop/kengetallen"] }),
  });
}

function useDeleteKengetal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API_BASE}/mjop/kengetallen/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mjop/kengetallen"] }),
  });
}

function useScenarios() {
  return useQuery<MjopScenario[]>({
    queryKey: ["/api/mjop/scenarios"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/mjop/scenarios`, { credentials: "include" });
      if (!r.ok) throw new Error("Laden mislukt");
      return r.json() as Promise<MjopScenario[]>;
    },
  });
}

function useCreateScenario(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Omit<MjopScenario, "id" | "createdAt">) => {
      const r = await fetch(`${API_BASE}/mjop/scenarios`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Opslaan mislukt");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mjop/scenarios"] });
      onDone();
    },
  });
}

function useUpdateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Partial<MjopScenario> & { id: number }) => {
      const r = await fetch(`${API_BASE}/mjop/scenarios/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Bijwerken mislukt");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mjop/scenarios"] });
      qc.invalidateQueries({ queryKey: ["/api/mjop/scenarios/begroting"] });
    },
  });
}

function useDeleteScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API_BASE}/mjop/scenarios/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Verwijderen mislukt");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mjop/scenarios"] }),
  });
}

type AdviesItem = {
  bouwdeelId: number;
  bouwdeelCode: string;
  bouwdeelName: string;
  buildingName: string | null;
  latestScore: number | null;
  installYear: number;
  expectedLifespanYears: number;
  endOfLife: number;
  replacementCost: number;
  urgencyLevel: "kritiek" | "hoog" | "gemiddeld" | "laag";
  advies: string;
  targetYear: number | null;
  reason: string;
};

function useAdvies(scenarioId: number | null) {
  return useQuery<AdviesItem[]>({
    queryKey: ["/api/mjop/scenarios/advies", scenarioId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/mjop/scenarios/${scenarioId}/advies`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Advies laden mislukt");
      return r.json() as Promise<AdviesItem[]>;
    },
    enabled: scenarioId !== null,
  });
}

function useBegroting(scenarioId: number | null) {
  return useQuery<BegrotingEntry[]>({
    queryKey: ["/api/mjop/scenarios/begroting", scenarioId],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/mjop/scenarios/${scenarioId}/begroting`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Begroting laden mislukt");
      return r.json() as Promise<BegrotingEntry[]>;
    },
    enabled: scenarioId !== null,
  });
}

type JaarplanResult = { aangemaakt: number; taken: { id: number; title: string; estimatedCost: number }[]; message?: string };
const bouwdeelSchema = z.object({
  code: z.string().min(2, "Code is verplicht"),
  name: z.string().min(2, "Naam is verplicht"),
  category: z.string().min(1, "Categorie is verplicht"),
  nlSfbCode: z.string().optional().nullable(),
  buildingId: z.number({ message: "Gebouw is verplicht" }),
  floorId: z.number().optional().nullable(),
  material: z.string().optional(),
  installYear: z.coerce.number().int().min(1900).max(2100),
  expectedLifespanYears: z.coerce.number().int().min(1).max(150),
  replacementCost: z.coerce.number().min(0),
  notes: z.string().optional(),
});

const taakSchema = z.object({
  bouwdeelId: z.number({ message: "Bouwdeel is verplicht" }),
  title: z.string().min(2, "Titel is verplicht"),
  description: z.string().optional(),
  taskType: z.string().min(1, "Type is verplicht"),
  plannedYear: z.coerce.number().int().min(2020).max(2100),
  estimatedCost: z.coerce.number().min(0),
});

function NieuwBouwdeelDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: structure } = useGetStructure();
  const { data: kengetallen = [] } = useListKostenKengetallen();
  const createBouwdeel = useCreateBouwdeel();

  // Kengetal prefill state
  const [selectedKengetalId, setSelectedKengetalId] = useState<string>("");
  const [kengetalQuantity, setKengetalQuantity] = useState<string>("1");

  const buildings =
    structure?.flatMap((o) =>
      o.sites.flatMap((s) =>
        s.buildings.map((b) => ({ ...b, siteName: s.name })),
      ),
    ) ?? [];

  const form = useForm<z.infer<typeof bouwdeelSchema>>({
    resolver: zodResolver(bouwdeelSchema),
    defaultValues: {
      code: "",
      name: "",
      category: "",
      installYear: new Date().getFullYear() - 10,
      expectedLifespanYears: 25,
      replacementCost: 0,
    },
  });
  const buildingId = form.watch("buildingId");
  const floors = buildings.find((b) => b.id === buildingId)?.floors ?? [];

  // Auto-fill replacementCost when kengetal + quantity are both set
  const applyKengetal = (kengetalId: string, qty: string) => {
    const kg = kengetallen.find((k) => k.id.toString() === kengetalId);
    const quantity = parseFloat(qty);
    if (kg && !isNaN(quantity) && quantity > 0) {
      form.setValue("replacementCost", Math.round(kg.pricePerUnit * quantity));
    }
  };

  const onSubmit = (values: z.infer<typeof bouwdeelSchema>) => {
    createBouwdeel.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Bouwdeel geregistreerd" });
          setOpen(false);
          form.reset();
          setSelectedKengetalId("");
          setKengetalQuantity("1");
          queryClient.invalidateQueries({ queryKey: ["/api/bouwdelen"] });
        },
        onError: () =>
          toast({ title: "Registreren mislukt", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Bouwdeel registreren
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuw bouwdeel registreren</DialogTitle>
          <DialogDescription>
            Koppel het bouwdeel aan de bestaande gebouwstructuur.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="Bijv. BD-DAK-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Naam</FormLabel>
                    <FormControl>
                      <Input placeholder="Bijv. Bitumen dakbedekking" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categorie</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kies categorie" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nlSfbCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>NL-SfB code (optioneel)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                      value={field.value ?? "__none__"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kies NL-SfB code" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— Geen —</SelectItem>
                        {NL_SFB_CODES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="material"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Materiaal (optioneel)</FormLabel>
                    <FormControl>
                      <Input placeholder="Bijv. bitumen, aluminium" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="buildingId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gebouw</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v))}
                      value={field.value?.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kies gebouw" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {buildings.map((b) => (
                          <SelectItem key={b.id} value={b.id.toString()}>
                            {b.name} ({b.siteName})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="floorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verdieping (optioneel)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(parseInt(v))}
                    value={field.value?.toString() || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Kies verdieping" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {floors.map((f) => (
                        <SelectItem key={f.id} value={f.id.toString()}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="installYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bouwjaar</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expectedLifespanYears"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Levensduur (jaren)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="replacementCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vervangingskosten (€)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {/* Kengetal prefill – voorstel uit de kostenbibliotheek */}
            {kengetallen.length > 0 && (
              <div className="rounded-md border p-3 space-y-2 bg-muted/40">
                <p className="text-xs font-medium text-muted-foreground">
                  Voorstel uit kostenbibliotheek
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Kengetal</Label>
                    <Select
                      value={selectedKengetalId}
                      onValueChange={(v) => {
                        setSelectedKengetalId(v);
                        applyKengetal(v, kengetalQuantity);
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Kies een kengetal…" />
                      </SelectTrigger>
                      <SelectContent>
                        {kengetallen.map((k) => (
                          <SelectItem key={k.id} value={k.id.toString()} className="text-xs">
                            {k.name} — {euro(k.pricePerUnit)}/{k.unit}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">
                      Hoeveelheid ({kengetallen.find((k) => k.id.toString() === selectedKengetalId)?.unit ?? "eenheid"})
                    </Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      min={0}
                      value={kengetalQuantity}
                      onChange={(e) => {
                        setKengetalQuantity(e.target.value);
                        applyKengetal(selectedKengetalId, e.target.value);
                      }}
                    />
                  </div>
                </div>
                {selectedKengetalId && (() => {
                  const kg = kengetallen.find((k) => k.id.toString() === selectedKengetalId);
                  const qty = parseFloat(kengetalQuantity);
                  if (!kg || isNaN(qty) || qty <= 0) return null;
                  return (
                    <p className="text-xs text-muted-foreground">
                      Voorstel: {euro(kg.pricePerUnit)} × {qty} {kg.unit} = <span className="font-semibold text-foreground">{euro(Math.round(kg.pricePerUnit * qty))}</span>
                    </p>
                  );
                })()}
              </div>
            )}
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={createBouwdeel.isPending}>
                {createBouwdeel.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Registreren
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface NieuweTaakDialogPrefill {
  bouwdeelId?: number;
  taskType?: string;
  plannedYear?: number;
}

export function NieuweTaakDialog({
  prefill,
  externalOpen,
  onExternalOpenChange,
}: {
  prefill?: NieuweTaakDialogPrefill;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
} = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const { data: bouwdelen } = useListBouwdelen();
  const createTaak = useCreateMjopTaak();

  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = isControlled
    ? (v: boolean) => onExternalOpenChange?.(v)
    : setInternalOpen;

  const form = useForm<z.infer<typeof taakSchema>>({
    resolver: zodResolver(taakSchema),
    defaultValues: {
      title: "",
      taskType: prefill?.taskType ?? "onderhoud",
      plannedYear: prefill?.plannedYear ?? new Date().getFullYear() + 1,
      estimatedCost: 0,
      bouwdeelId: prefill?.bouwdeelId,
    },
  });

  // Sync prefill into form whenever the dialog opens or prefill changes
  useEffect(() => {
    if (open) {
      form.reset({
        title: "",
        taskType: prefill?.taskType ?? "onderhoud",
        plannedYear: prefill?.plannedYear ?? new Date().getFullYear() + 1,
        estimatedCost: 0,
        bouwdeelId: prefill?.bouwdeelId,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = (values: z.infer<typeof taakSchema>) => {
    createTaak.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "MJOP-taak toegevoegd" });
          setOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: ["/api/mjop-taken"] });
          queryClient.invalidateQueries({ queryKey: ["/api/mjop/jaarplanning"] });
        },
        onError: () =>
          toast({ title: "Toevoegen mislukt", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            MJOP-taak
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nieuwe MJOP-taak</DialogTitle>
          <DialogDescription>
            Plan onderhoud, vervanging of inspectie voor een bouwdeel.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="bouwdeelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bouwdeel</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(parseInt(v))}
                    value={field.value?.toString() || ""}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Kies bouwdeel" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bouwdelen?.map((b) => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.code} — {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titel</FormLabel>
                  <FormControl>
                    <Input placeholder="Bijv. Dakbedekking vervangen" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="taskType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TAAK_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="plannedYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gepland jaar</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="estimatedCost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kostenraming (€)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Toelichting (optioneel)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={createTaak.isPending}>
                {createTaak.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Toevoegen
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ── Kostenbibliotheek ─────────────────────────────────────────────────────────

function KengetalDialog({
  onDone,
  initial,
}: {
  onDone: () => void;
  initial?: KostenKengetal;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [nlSfbCode, setNlSfbCode] = useState(initial?.nlSfbCode ?? "__none__");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [pricePerUnit, setPricePerUnit] = useState(String(initial?.pricePerUnit ?? ""));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const createK = useCreateKengetal(() => { setOpen(false); onDone(); });
  const updateK = useUpdateKengetal();

  const handleSubmit = () => {
    const price = parseFloat(pricePerUnit);
    if (!name.trim() || !category.trim() || !unit.trim() || isNaN(price)) {
      toast({ title: "Vul alle verplichte velden in", variant: "destructive" });
      return;
    }
    const payload = {
      name: name.trim(),
      category: category.trim(),
      nlSfbCode: nlSfbCode === "__none__" ? null : nlSfbCode,
      unit: unit.trim(),
      pricePerUnit: price,
      notes: notes || null,
      isActive: false,
    };
    if (initial) {
      updateK.mutate({ id: initial.id, ...payload }, {
        onSuccess: () => { toast({ title: "Kengetal bijgewerkt" }); setOpen(false); onDone(); },
        onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
      });
    } else {
      createK.mutate(payload, {
        onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? (
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Kengetal toevoegen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Kengetal bewerken" : "Nieuw kengetal"}</DialogTitle>
          <DialogDescription>
            Stel de prijs per eenheid in voor dit element uit de kostenbibliotheek.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Naam</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Bitumen dakbedekking" />
            </div>
            <div className="space-y-1">
              <Label>Categorie</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Kies categorie" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>NL-SfB code (optioneel)</Label>
              <Select value={nlSfbCode} onValueChange={setNlSfbCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Geen —</SelectItem>
                  {NL_SFB_CODES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Eenheid</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m², stuk, m" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Prijs per eenheid (€)</Label>
            <Input type="number" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1">
            <Label>Notities (optioneel)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bijv. inclusief arbeid en materieel" />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={createK.isPending || updateK.isPending}>
            {(createK.isPending || updateK.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KostenbibliotheekTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const { data: kengetallen, isLoading } = useKengetallen();
  const deleteK = useDeleteKengetal();

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Kengetal "${name}" verwijderen?`)) return;
    deleteK.mutate(id, {
      onSuccess: () => toast({ title: "Kengetal verwijderd" }),
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Kengetallen (€ per eenheid) worden als voorstel gebruikt bij het invullen van vervangingskosten voor bouwdelen.
          </p>
        </div>
        {canManage && <KengetalDialog onDone={() => {}} />}
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead>NL-SfB</TableHead>
                <TableHead>Eenheid</TableHead>
                <TableHead className="text-right">Prijs / eenheid</TableHead>
                {canManage && <TableHead className="text-right">Acties</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!kengetallen?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    Nog geen kengetallen in de bibliotheek.
                  </TableCell>
                </TableRow>
              ) : (
                kengetallen.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">
                      {k.name}
                      {k.notes && (
                        <p className="text-xs text-muted-foreground font-normal">{k.notes}</p>
                      )}
                    </TableCell>
                    <TableCell className="capitalize">{k.category}</TableCell>
                    <TableCell>
                      {k.nlSfbCode ? (
                        <Badge variant="outline" className="text-xs font-mono">{k.nlSfbCode}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>{k.unit}</TableCell>
                    <TableCell className="text-right font-mono">
                      {euro(k.pricePerUnit)} / {k.unit}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <KengetalDialog onDone={() => {}} initial={k} />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(k.id, k.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Scenarioplanning ──────────────────────────────────────────────────────────

function ScenarioDialog({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("noodzakelijk");
  const [description, setDescription] = useState("");
  const createS = useCreateScenario(() => { setOpen(false); onDone(); });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    createS.mutate({ name: name.trim(), type, description: description || null, buildingId: null, isActive: false }, {
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Scenario toevoegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nieuw scenario</DialogTitle>
          <DialogDescription>Stel een meerjarenbegrotingsscenario in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Naam</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Alleen noodzakelijk" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="noodzakelijk">Alleen noodzakelijk</SelectItem>
                <SelectItem value="hoog">Instandhouding hoog niveau</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Omschrijving (optioneel)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={handleSubmit} disabled={createS.isPending}>
            {createS.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioplanningTab({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const { data: scenarios, isLoading } = useScenarios();
  const updateS = useUpdateScenario();
  const deleteS = useDeleteScenario();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [jaarplanJaar, setJaarplanJaar] = useState<number>(new Date().getFullYear() + 1);
  const [jaarplanResult, setJaarplanResult] = useState<JaarplanResult | null>(null);
  const geneerJaarplan = useGeneerJaarplan();

  // Auto-select active scenario or first
  const activeScenario = scenarios?.find((s) => s.isActive) ?? scenarios?.[0] ?? null;
  const viewId = selectedId ?? activeScenario?.id ?? null;

  const { data: begroting, isLoading: begrotingLoading } = useBegroting(viewId);
  const { data: advies, isLoading: adviesLoading } = useAdvies(viewId);
  const viewScenario = scenarios?.find((s) => s.id === viewId);

  const maxCost = Math.max(...(begroting?.map((e) => e.totalCost) ?? [1]), 1);

  const handleActivate = (s: MjopScenario) => {
    updateS.mutate({ id: s.id, isActive: !s.isActive }, {
      onSuccess: () => {
        toast({ title: s.isActive ? "Scenario gedeactiveerd" : "Scenario geactiveerd" });
        qc.invalidateQueries({ queryKey: ["/api/mjop/scenarios"] });
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    });
  };

  const handleDelete = (s: MjopScenario) => {
    if (!confirm(`Scenario "${s.name}" verwijderen?`)) return;
    deleteS.mutate(s.id, {
      onSuccess: () => toast({ title: "Scenario verwijderd" }),
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    });
  };

  const handleGeneerJaarplan = () => {
    if (!viewId) return;
    setJaarplanResult(null);
    geneerJaarplan.mutate({ scenarioId: viewId, jaar: jaarplanJaar }, {
      onSuccess: (data) => {
        setJaarplanResult(data);
        toast({
          title: data.aangemaakt > 0
            ? `${data.aangemaakt} taak${data.aangemaakt === 1 ? "" : "en"} aangemaakt voor ${jaarplanJaar}`
            : "Geen nieuwe taken",
          description: data.message,
        });
      },
      onError: (err) => toast({ title: "Genereren mislukt", description: err.message, variant: "destructive" }),
    });
  };

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {/* Scenario list */}
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Scenario's</CardTitle>
            {canManage && <ScenarioDialog onDone={() => {}} />}
          </CardHeader>
          <CardContent className="space-y-2">
            {!scenarios?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nog geen scenario's aangemaakt.
              </p>
            ) : (
              scenarios.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg border p-3 cursor-pointer transition-colors",
                    viewId === s.id ? "border-primary bg-primary/5" : "hover:border-primary/40",
                  )}
                  onClick={() => setSelectedId(s.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {s.isActive ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{s.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {s.type === "noodzakelijk" ? "Alleen noodzakelijk" : "Instandhouding hoog niveau"}
                        </p>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={s.isActive ? "Deactiveer" : "Activeer"}
                          onClick={() => handleActivate(s)}
                          disabled={updateS.isPending}
                        >
                          {s.isActive ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <Circle className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(s)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground mt-1 ml-6">{s.description}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Begroting summary */}
        {viewScenario && begroting && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Totaaloverzicht — {viewScenario.name}</span>
                <Badge variant="outline" className="text-xs">
                  {begroting.reduce((s, e) => s + e.taken.length, 0)} vervangingen
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-4">
                {euro(begroting.reduce((s, e) => s + e.totalCost, 0))}
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  totaal ({begroting[0]?.year ?? "—"} – {begroting[begroting.length - 1]?.year ?? "—"})
                </span>
              </div>
              {begroting.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Geen vervangingen voorzien binnen de horizon van 15 jaar.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Jaarplan genereren */}
      {viewScenario && canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Jaarplan genereren — {viewScenario.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Genereer MJOP-taken voor het gekozen jaar op basis van de begrotingsberekening van dit scenario. Bouwdelen die al een taak hebben voor dat jaar worden overgeslagen.
            </p>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium whitespace-nowrap">Jaar:</label>
              <Input
                type="number"
                min={new Date().getFullYear()}
                max={new Date().getFullYear() + 15}
                value={jaarplanJaar}
                onChange={(e) => setJaarplanJaar(Number(e.target.value))}
                className="w-28"
              />
              <Button
                onClick={handleGeneerJaarplan}
                disabled={geneerJaarplan.isPending || !viewId}
              >
                {geneerJaarplan.isPending ? "Bezig…" : "Genereer jaarplan"}
              </Button>
            </div>
            {jaarplanResult && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-sm font-medium">
                  {jaarplanResult.aangemaakt > 0
                    ? `${jaarplanResult.aangemaakt} taak${jaarplanResult.aangemaakt === 1 ? "" : "en"} aangemaakt voor ${jaarplanJaar}`
                    : jaarplanResult.message ?? "Geen nieuwe taken aangemaakt"}
                </p>
                {jaarplanResult.taken.length > 0 && (
                  <div className="space-y-1">
                    {jaarplanResult.taken.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs bg-background rounded px-2 py-1.5">
                        <span>{t.title}</span>
                        <span className="font-medium tabular-nums ml-3">{euro(t.estimatedCost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Onderhoudsadvies */}
      {viewScenario && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Onderhoudsadvies — {viewScenario.name}
              {advies && advies.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {advies.length} {advies.length === 1 ? "aanbeveling" : "aanbevelingen"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {adviesLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : !advies?.length ? (
              <div className="text-center py-10 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-40 text-green-500" />
                <p className="text-sm">
                  {viewScenario.type === "noodzakelijk"
                    ? "Geen bouwdelen vereisen op dit moment noodzakelijk onderhoud of vervanging."
                    : "Geen bouwdelen vereisen momenteel een actie volgens dit scenario."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {(["kritiek", "hoog", "gemiddeld", "laag"] as const).map((level) => {
                  const groep = advies.filter((a) => a.urgencyLevel === level);
                  if (!groep.length) return null;
                  const labelMap = {
                    kritiek: { label: "Kritiek", icon: <ShieldAlert className="h-3.5 w-3.5" />, cls: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800" },
                    hoog: { label: "Hoog", icon: <AlertTriangle className="h-3.5 w-3.5" />, cls: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800" },
                    gemiddeld: { label: "Gemiddeld", icon: <Info className="h-3.5 w-3.5" />, cls: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" },
                    laag: { label: "Laag", icon: <Circle className="h-3.5 w-3.5" />, cls: "bg-muted text-muted-foreground border-border" },
                  };
                  const { label, icon, cls } = labelMap[level];
                  return (
                    <div key={level} className="space-y-1.5">
                      <div className={cn("flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md border w-fit", cls)}>
                        {icon}
                        {label} ({groep.length})
                      </div>
                      {groep.map((item) => (
                        <div
                          key={item.bouwdeelId}
                          className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono text-xs text-muted-foreground">{item.bouwdeelCode}</span>
                              <span className="font-medium truncate">{item.bouwdeelName}</span>
                              {item.buildingName && (
                                <span className="text-xs text-muted-foreground">({item.buildingName})</span>
                              )}
                              {item.latestScore !== null && (
                                <Badge
                                  variant="secondary"
                                  className={cn("text-xs border-transparent px-1.5 py-0", scoreColor(item.latestScore))}
                                >
                                  Score {item.latestScore}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>
                          </div>
                          <div className="shrink-0 text-right space-y-0.5">
                            <p className="text-xs font-semibold whitespace-nowrap">{item.advies}</p>
                            <p className="text-xs text-muted-foreground">{euro(item.replacementCost)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Meerjarenbegroting grafiek */}
      {viewScenario && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Meerjarenbegroting — {viewScenario.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {begrotingLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : !begroting?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Geen vervangingen gepland binnen de planningshorizon (15 jaar).</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Bar chart */}
                <div className="space-y-2">
                  {begroting.map((e) => (
                    <div key={e.year} className="flex items-center gap-3">
                      <span className="w-12 text-sm font-medium tabular-nums">{e.year}</span>
                      <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded transition-all",
                            viewScenario.type === "noodzakelijk"
                              ? "bg-amber-500/80"
                              : "bg-blue-500/80",
                          )}
                          style={{ width: `${Math.max((e.totalCost / maxCost) * 100, 2)}%` }}
                        />
                      </div>
                      <span className="w-28 text-right text-sm font-medium tabular-nums">
                        {euro(e.totalCost)}
                      </span>
                      <span className="text-xs text-muted-foreground w-16">
                        {e.taken.length} {e.taken.length === 1 ? "element" : "elementen"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Detail per year */}
                <div className="space-y-3 pt-2 border-t">
                  <h4 className="text-sm font-medium text-muted-foreground">Vervangingen per jaar</h4>
                  {begroting.map((e) => (
                    <div key={e.year}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{e.year}</span>
                        <span className="text-sm font-semibold">{euro(e.totalCost)}</span>
                      </div>
                      <div className="space-y-1">
                        {e.taken.map((t, i) => (
                          <div key={i} className="flex items-start justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                            <div>
                              <span className="font-mono text-muted-foreground mr-1">{t.bouwdeelCode}</span>
                              <span>{t.bouwdeelName}</span>
                              {t.buildingName && (
                                <span className="text-muted-foreground ml-1">({t.buildingName})</span>
                              )}
                              <p className="text-muted-foreground mt-0.5">{t.reason}</p>
                            </div>
                            <span className="font-medium tabular-nums ml-3 shrink-0">{euro(t.cost)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Hoofdpagina ───────────────────────────────────────────────────────────────

export default function MjopPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [activeTab, setActiveTab] = useState("bouwdelen");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [nlSfbFilter, setNlSfbFilter] = useState("all");
  // scoreFilter drives client-side score filtering; seeded from ?filter=slechteConditie URL param
  const [scoreFilter, setScoreFilter] = useState(() => {
    const params = new URLSearchParams(searchString);
    return params.get("filter") === "slechteConditie" ? "4" : "all";
  });
  const [taakStatus, setTaakStatus] = useState("all");
  const [taakJaar, setTaakJaar] = useState("all");

  // Sync scoreFilter when URL param changes (e.g. back-navigation from dashboard)
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get("filter") === "slechteConditie") {
      setScoreFilter("4");
      setActiveTab("bouwdelen");
    }
  }, [searchString]);

  // Unfiltered query for summary stats
  const { data: allBouwdelen } = useListBouwdelen();

  const { data: bouwdelenRaw, isLoading } = useListBouwdelen({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
    nlSfbCode: nlSfbFilter !== "all" ? nlSfbFilter : undefined,
  });

  // Apply score filter client-side
  const bouwdelen = scoreFilter === "all"
    ? bouwdelenRaw
    : bouwdelenRaw?.filter((b) =>
        b.laatsteScore != null && b.laatsteScore >= Number(scoreFilter),
      );

  const clearScoreFilter = () => {
    setScoreFilter("all");
    // Also clear URL param if it was set from the dashboard
    const params = new URLSearchParams(searchString);
    if (params.get("filter")) setLocation("/mjop");
  };

  const { data: taken } = useListMjopTaken({
    status: taakStatus !== "all" ? taakStatus : undefined,
    year: taakJaar !== "all" ? Number(taakJaar) : undefined,
  });
  const { data: jaarplanning } = useGetJaarplanning();
  const convert = useConvertMjopTaakToTicket();

  const canManage =
    user?.role === "facilitair_manager" || user?.role === "beheerder";

  const onConvert = (id: number) => {
    convert.mutate(
      { id },
      {
        onSuccess: (taak) => {
          toast({
            title: "Melding aangemaakt",
            description: `Servicedesk-ticket ${taak.ticketNumber ?? ""} is aangemaakt.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/mjop-taken"] });
          queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
        },
        onError: () =>
          toast({ title: "Omzetten mislukt", variant: "destructive" }),
      },
    );
  };

  const jaren = Array.from(
    new Set(jaarplanning?.map((j) => j.year) ?? []),
  ).sort();
  const maxCost = Math.max(...(jaarplanning?.map((j) => j.totalCost) ?? [1]), 1);

  // Summary stats computed from the unfiltered list
  const slechteConditieCount = allBouwdelen?.filter(
    (b) => b.laatsteScore != null && b.laatsteScore >= 4,
  ).length ?? 0;
  const totalBouwdelen = allBouwdelen?.length ?? 0;
  const nietGemetenCount = allBouwdelen?.filter((b) => b.laatsteScore == null).length ?? 0;

  const goToSlechteConditie = () => {
    setActiveTab("bouwdelen");
    setScoreFilter("4");
    setSearch("");
    setCategory("all");
    setNlSfbFilter("all");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MJOP</h1>
          <p className="text-muted-foreground">
            Meerjarenonderhoudsplan: NL-SfB-classificatie, NEN 2767-conditiemeting,
            kostenbibliotheek en scenarioplanning.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <NieuweTaakDialog />
            <NieuwBouwdeelDialog />
          </div>
        )}
      </div>

      {/* ── Overzichtskaarten ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="rounded-lg bg-muted p-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Totaal bouwdelen</p>
              <p className="text-2xl font-bold">{totalBouwdelen}</p>
            </div>
          </CardContent>
        </Card>

        {/* Klikbare "slechte conditie" kaart */}
        <Card
          className="cursor-pointer hover:border-destructive/60 transition-colors group"
          onClick={goToSlechteConditie}
          title="Klik om te filteren op bouwdelen met slechte conditie (score ≥ 4)"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="rounded-lg bg-red-100 dark:bg-red-900/30 p-2">
              <Wrench className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground group-hover:text-destructive transition-colors">
                Slechte conditie (≥ 4)
              </p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {slechteConditieCount}
              </p>
            </div>
            <span className="text-xs text-muted-foreground group-hover:text-destructive transition-colors">
              bekijk →
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="rounded-lg bg-muted p-2">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Niet gemeten</p>
              <p className="text-2xl font-bold">{nietGemetenCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bouwdelen">
            <Building2 className="mr-2 h-4 w-4" />
            Bouwdelen
          </TabsTrigger>
          <TabsTrigger value="taken">
            <ListChecks className="mr-2 h-4 w-4" />
            Taken
          </TabsTrigger>
          <TabsTrigger value="jaarplanning">
            <CalendarRange className="mr-2 h-4 w-4" />
            Jaarplanning
          </TabsTrigger>
          <TabsTrigger value="kostenbibliotheek">
            <BookOpen className="mr-2 h-4 w-4" />
            Kostenbibliotheek
          </TabsTrigger>
          <TabsTrigger value="scenarioplanning">
            <TrendingUp className="mr-2 h-4 w-4" />
            Scenarioplanning
          </TabsTrigger>
        </TabsList>

        {/* ── Bouwdelen tab ── */}
        <TabsContent value="bouwdelen" className="space-y-4 mt-4">
          {scoreFilter !== "all" && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1 text-sm bg-destructive/10 text-destructive border-destructive/20">
                <Wrench className="h-3.5 w-3.5" />
                Slechte conditie (score ≥ {scoreFilter})
                <button
                  onClick={clearScoreFilter}
                  className="ml-1 rounded-full hover:bg-destructive/20 transition-colors p-0.5"
                  aria-label="Filter verwijderen"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 bg-card p-4 rounded-lg border shadow-sm flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoeken op naam of code..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alle categorieën" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle categorieën</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={nlSfbFilter} onValueChange={setNlSfbFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Alle NL-SfB codes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle NL-SfB codes</SelectItem>
                {NL_SFB_CODES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="w-[210px]">
                <SelectValue placeholder="Alle condities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle condities</SelectItem>
                <SelectItem value="4">Slechte conditie (score ≥ 4)</SelectItem>
                <SelectItem value="5">Zeer slecht (score ≥ 5)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          ) : !bouwdelen?.length ? (
            <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center justify-center">
              <Wrench className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Geen bouwdelen gevonden</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                Registreer een bouwdeel of pas de filters aan.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bouwdelen.map((b) => (
                <Card
                  key={b.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors group"
                  onClick={() => setLocation(`/mjop/bouwdelen/${b.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div className="space-y-1">
                        <h3 className="font-semibold leading-tight group-hover:text-primary transition-colors">
                          {b.name}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono text-muted-foreground">
                            {b.code}
                          </span>
                          {b.nlSfbCode && (
                            <Badge variant="outline" className="text-xs font-mono px-1 py-0">
                              {b.nlSfbCode}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {b.laatsteScore ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "border-transparent font-semibold whitespace-nowrap ml-2",
                            scoreColor(b.laatsteScore),
                          )}
                        >
                          Conditie {b.laatsteScore}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="ml-2 whitespace-nowrap">
                          Niet gemeten
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span className="truncate">
                          {b.buildingName}
                          {b.floorName ? ` • ${b.floorName}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 capitalize">
                        <Wrench className="h-4 w-4" />
                        <span>
                          {b.category} • {b.installYear} •{" "}
                          {b.expectedLifespanYears} jr levensduur
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Euro className="h-4 w-4" />
                        <span>Vervanging: {euro(b.replacementCost)}</span>
                      </div>
                    </div>
                    {b.openTaken > 0 && (
                      <div className="mt-3 text-xs font-medium text-primary">
                        {b.openTaken} open {b.openTaken === 1 ? "taak" : "taken"}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Taken tab ── */}
        <TabsContent value="taken" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border shadow-sm">
            <Select value={taakJaar} onValueChange={setTaakJaar}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Alle jaren" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle jaren</SelectItem>
                {jaren.map((j) => (
                  <SelectItem key={j} value={String(j)}>
                    {j}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={taakStatus} onValueChange={setTaakStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Alle statussen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="gepland">Gepland</SelectItem>
                <SelectItem value="in_uitvoering">In uitvoering</SelectItem>
                <SelectItem value="afgerond">Afgerond</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Taak</TableHead>
                    <TableHead>Bouwdeel</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Jaar</TableHead>
                    <TableHead className="text-right">Kostenraming</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Melding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!taken?.length ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-12 text-muted-foreground"
                      >
                        Geen MJOP-taken gevonden.
                      </TableCell>
                    </TableRow>
                  ) : (
                    taken.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <span className="font-mono text-xs">{t.bouwdeelCode}</span>{" "}
                          {t.bouwdeelName}
                        </TableCell>
                        <TableCell className="capitalize">{t.taskType}</TableCell>
                        <TableCell>{t.plannedYear}</TableCell>
                        <TableCell className="text-right">
                          {euro(t.estimatedCost)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "border-transparent",
                              taakStatusColor(t.status),
                            )}
                          >
                            {taakStatusLabel(t.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
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
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Jaarplanning tab ── */}
        <TabsContent value="jaarplanning" className="space-y-4 mt-4">
          {!jaarplanning?.length ? (
            <div className="text-center py-24 bg-card rounded-lg border border-dashed">
              <CalendarRange className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
              <h3 className="text-lg font-medium">Nog geen jaarplanning</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Voeg MJOP-taken toe om de meerjarenplanning op te bouwen.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Kostenraming per jaar (geplande taken)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {jaarplanning.map((j) => (
                    <div key={j.year} className="flex items-center gap-4">
                      <span className="w-12 text-sm font-medium">{j.year}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-primary/80 rounded"
                          style={{
                            width: `${Math.max((j.totalCost / maxCost) * 100, 2)}%`,
                          }}
                        />
                      </div>
                      <span className="w-28 text-right text-sm font-medium">
                        {euro(j.totalCost)}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {jaarplanning.map((j) => (
                  <Card key={j.year}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center justify-between">
                        {j.year}
                        <span className="text-sm font-normal text-muted-foreground">
                          {j.taskCount} {j.taskCount === 1 ? "taak" : "taken"}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-2xl font-bold">{euro(j.totalCost)}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {j.byType.map((t) => (
                          <Badge key={t.key} variant="outline" className="capitalize">
                            {t.key}: {t.count}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {j.byStatus.map((s) => (
                          <Badge
                            key={s.key}
                            variant="secondary"
                            className={cn("border-transparent", taakStatusColor(s.key))}
                          >
                            {taakStatusLabel(s.key)}: {s.count}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Kostenbibliotheek tab ── */}
        <TabsContent value="kostenbibliotheek" className="mt-4">
          <KostenbibliotheekTab canManage={canManage} />
        </TabsContent>

        {/* ── Scenarioplanning tab ── */}
        <TabsContent value="scenarioplanning" className="mt-4">
          <ScenarioplanningTab canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useGeneerJaarplan() {
  const qc = useQueryClient();
  return useMutation<JaarplanResult, Error, { scenarioId: number; jaar: number }>({
    mutationFn: async ({ scenarioId, jaar }) => {
      const r = await fetch(`${API_BASE}/mjop/scenarios/${scenarioId}/jaarplan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jaar }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? "Jaarplan genereren mislukt");
      }
      return r.json() as Promise<JaarplanResult>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mjop-taken"] });
      qc.invalidateQueries({ queryKey: ["/api/mjop/jaarplanning"] });
    },
  });
}
