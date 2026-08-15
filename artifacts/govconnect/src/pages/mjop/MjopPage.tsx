import { useState } from "react";
import { useLocation } from "wouter";
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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  euro,
} from "./mjop-helpers";

const bouwdeelSchema = z.object({
  code: z.string().min(2, "Code is verplicht"),
  name: z.string().min(2, "Naam is verplicht"),
  category: z.string().min(1, "Categorie is verplicht"),
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
  const createBouwdeel = useCreateBouwdeel();

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

  const onSubmit = (values: z.infer<typeof bouwdeelSchema>) => {
    createBouwdeel.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Bouwdeel geregistreerd" });
          setOpen(false);
          form.reset();
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
      <DialogContent className="max-w-2xl">
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
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            </div>
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

function NieuweTaakDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: bouwdelen } = useListBouwdelen();
  const createTaak = useCreateMjopTaak();

  const form = useForm<z.infer<typeof taakSchema>>({
    resolver: zodResolver(taakSchema),
    defaultValues: {
      title: "",
      taskType: "onderhoud",
      plannedYear: new Date().getFullYear() + 1,
      estimatedCost: 0,
    },
  });

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
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          MJOP-taak
        </Button>
      </DialogTrigger>
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

export default function MjopPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [taakStatus, setTaakStatus] = useState("all");
  const [taakJaar, setTaakJaar] = useState("all");

  const { data: bouwdelen, isLoading } = useListBouwdelen({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
  });
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MJOP</h1>
          <p className="text-muted-foreground">
            Meerjarenonderhoudsplan: bouwdelen, conditiemeting (NEN 2767) en
            jaarplanning.
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <NieuweTaakDialog />
            <NieuwBouwdeelDialog />
          </div>
        )}
      </div>

      <Tabs defaultValue="bouwdelen">
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
        </TabsList>

        <TabsContent value="bouwdelen" className="space-y-4 mt-4">
          <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoeken op naam of code..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[200px]">
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
                        <div className="text-xs font-mono text-muted-foreground">
                          {b.code}
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
                  <CardTitle className="text-base">
                    Kostenraming per jaar
                  </CardTitle>
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
                          <Badge
                            key={t.key}
                            variant="outline"
                            className="capitalize"
                          >
                            {t.key}: {t.count}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {j.byStatus.map((s) => (
                          <Badge
                            key={s.key}
                            variant="secondary"
                            className={cn(
                              "border-transparent",
                              taakStatusColor(s.key),
                            )}
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
      </Tabs>
    </div>
  );
}
