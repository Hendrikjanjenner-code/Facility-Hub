import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListContracts,
  useCreateContract,
  useUpdateContract,
  useListSuppliers,
  useCreateSupplier,
  useGetCurrentUser,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Building, AlertTriangle, Loader2, Phone, Mail, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const SUPPLIER_CATEGORIES = ["techniek", "schoonmaak", "catering", "groenvoorziening", "beveiliging", "overig"];

const contractSchema = z.object({
  name: z.string().min(2, "Naam is verplicht"),
  supplierId: z.number({ message: "Kies een leverancier" }),
  category: z.string().min(2, "Categorie is verplicht"),
  description: z.string().optional(),
  startDate: z.string().min(10, "Startdatum is verplicht"),
  endDate: z.string().min(10, "Einddatum is verplicht"),
  noticePeriodDays: z.coerce.number().int().min(0),
  annualValue: z.coerce.number().optional(),
});

const supplierSchema = z.object({
  name: z.string().min(2, "Naam is verplicht"),
  category: z.string().min(2, "Categorie is verplicht"),
  contactName: z.string().optional(),
  email: z.string().email("Ongeldig e-mailadres").optional().or(z.literal("")),
  phone: z.string().optional(),
  kvkNumber: z.string().optional(),
});

function contractStatusBadge(status: string) {
  switch (status) {
    case "actief": return "bg-green-100 text-green-800";
    case "verlopen": return "bg-gray-100 text-gray-800";
    case "opgezegd": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

const eur = (v: number) => v.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const nlDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

export default function ContractenPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  const { data: contracts, isLoading } = useListContracts();
  const isManager = user?.role === "facilitair_manager" || user?.role === "beheerder";
  const { data: suppliers } = useListSuppliers({
    query: { queryKey: getListSuppliersQueryKey(), enabled: isManager },
  });
  const createContract = useCreateContract();
  const updateContract = useUpdateContract();
  const createSupplier = useCreateSupplier();

  const contractForm = useForm<z.input<typeof contractSchema>, any, z.output<typeof contractSchema>>({
    resolver: zodResolver(contractSchema),
    defaultValues: { name: "", category: "", description: "", startDate: "", endDate: "", noticePeriodDays: 90 },
  });
  const supplierForm = useForm<z.infer<typeof supplierSchema>>({
    resolver: zodResolver(supplierSchema),
    defaultValues: { name: "", category: "", contactName: "", email: "", phone: "", kvkNumber: "" },
  });

  const expiringCount = contracts?.filter((c) => c.expiringSoon).length ?? 0;

  const onSubmitContract = (values: z.output<typeof contractSchema>) => {
    createContract.mutate({ data: values as any }, {
      onSuccess: () => {
        toast({ title: "Contract toegevoegd" });
        setContractDialogOpen(false);
        contractForm.reset();
        queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    });
  };

  const onSubmitSupplier = (values: z.infer<typeof supplierSchema>) => {
    createSupplier.mutate({ data: { ...values, email: values.email || null } as any }, {
      onSuccess: () => {
        toast({ title: "Leverancier toegevoegd" });
        setSupplierDialogOpen(false);
        supplierForm.reset();
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    });
  };

  const terminate = (id: number) => {
    updateContract.mutate({ id, data: { status: "opgezegd" } }, {
      onSuccess: () => {
        toast({ title: "Contract opgezegd" });
        queryClient.invalidateQueries({ queryKey: ["/api/contracts"] });
      },
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Contracten & Inkoop</h1>
          <p className="text-muted-foreground">
            {user?.role === "leverancier"
              ? "Uw lopende contracten met de gemeente."
              : "Contractenkluis met einddatum-bewaking en leveranciersregister."}
          </p>
        </div>
      </div>

      {expiringCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {expiringCount} {expiringCount === 1 ? "contract valt" : "contracten vallen"} binnen de opzegtermijn — actie vereist.
          </p>
        </div>
      )}

      <Tabs defaultValue="contracten">
        <TabsList>
          <TabsTrigger value="contracten">Contracten</TabsTrigger>
          {isManager && <TabsTrigger value="leveranciers">Leveranciers</TabsTrigger>}
        </TabsList>

        <TabsContent value="contracten" className="space-y-4 pt-4">
          {isManager && (
            <div className="flex justify-end">
              <Dialog open={contractDialogOpen} onOpenChange={setContractDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Contract toevoegen</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Nieuw contract</DialogTitle>
                    <DialogDescription>Leg een contract vast in de contractenkluis.</DialogDescription>
                  </DialogHeader>
                  <Form {...contractForm}>
                    <form onSubmit={contractForm.handleSubmit(onSubmitContract)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={contractForm.control} name="name" render={({ field }) => (
                          <FormItem><FormLabel>Naam</FormLabel><FormControl><Input placeholder="Bijv. Onderhoud liften" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={contractForm.control} name="supplierId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Leverancier</FormLabel>
                            <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString() || ""}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Kies leverancier" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {suppliers?.map((s) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={contractForm.control} name="category" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Categorie</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Kies categorie" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {SUPPLIER_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={contractForm.control} name="annualValue" render={({ field }) => (
                          <FormItem><FormLabel>Jaarwaarde (€)</FormLabel><FormControl><Input type="number" step="100" {...field} value={(field.value as any) ?? ""} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField control={contractForm.control} name="startDate" render={({ field }) => (
                          <FormItem><FormLabel>Startdatum</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={contractForm.control} name="endDate" render={({ field }) => (
                          <FormItem><FormLabel>Einddatum</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={contractForm.control} name="noticePeriodDays" render={({ field }) => (
                          <FormItem><FormLabel>Opzegtermijn (dagen)</FormLabel><FormControl><Input type="number" {...field} value={(field.value as any) ?? 90} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <FormField control={contractForm.control} name="description" render={({ field }) => (
                        <FormItem><FormLabel>Omschrijving (optioneel)</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setContractDialogOpen(false)}>Annuleren</Button>
                        <Button type="submit" disabled={createContract.isPending}>
                          {createContract.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}</div>
          ) : !contracts?.length ? (
            <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Geen contracten</h3>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contract</TableHead>
                      <TableHead>Leverancier</TableHead>
                      <TableHead>Looptijd</TableHead>
                      <TableHead>Jaarwaarde</TableHead>
                      <TableHead>Status</TableHead>
                      {isManager && <TableHead className="text-right">Actie</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contracts.map((c) => (
                      <TableRow key={c.id} className={cn(c.expiringSoon && "bg-amber-50/60")}>
                        <TableCell>
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{c.category}</div>
                        </TableCell>
                        <TableCell>{c.supplierName}</TableCell>
                        <TableCell>
                          <div className="text-sm">{nlDate(c.startDate)} — {nlDate(c.endDate)}</div>
                          {c.status === "actief" && (
                            <div className={cn("text-xs", c.expiringSoon ? "text-amber-700 font-medium" : "text-muted-foreground")}>
                              {c.expiringSoon && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                              nog {c.daysUntilEnd} dagen{c.expiringSoon ? ` (opzegtermijn ${c.noticePeriodDays} dgn)` : ""}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{c.annualValue != null ? eur(c.annualValue) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={cn("capitalize border-transparent", contractStatusBadge(c.status))}>{c.status}</Badge>
                        </TableCell>
                        {isManager && (
                          <TableCell className="text-right">
                            {c.status === "actief" && (
                              <Button variant="outline" size="sm" onClick={() => terminate(c.id)} disabled={updateContract.isPending}>
                                Opzeggen
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {isManager && (
          <TabsContent value="leveranciers" className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="mr-2 h-4 w-4" />Leverancier toevoegen</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nieuwe leverancier</DialogTitle>
                    <DialogDescription>Registreer een leverancier in het register.</DialogDescription>
                  </DialogHeader>
                  <Form {...supplierForm}>
                    <form onSubmit={supplierForm.handleSubmit(onSubmitSupplier)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={supplierForm.control} name="name" render={({ field }) => (
                          <FormItem><FormLabel>Bedrijfsnaam</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={supplierForm.control} name="category" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Categorie</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Kies categorie" /></SelectTrigger></FormControl>
                              <SelectContent>
                                {SUPPLIER_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={supplierForm.control} name="contactName" render={({ field }) => (
                          <FormItem><FormLabel>Contactpersoon</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={supplierForm.control} name="kvkNumber" render={({ field }) => (
                          <FormItem><FormLabel>KvK-nummer</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <FormField control={supplierForm.control} name="email" render={({ field }) => (
                          <FormItem><FormLabel>E-mail</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={supplierForm.control} name="phone" render={({ field }) => (
                          <FormItem><FormLabel>Telefoon</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setSupplierDialogOpen(false)}>Annuleren</Button>
                        <Button type="submit" disabled={createSupplier.isPending}>
                          {createSupplier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {suppliers?.map((s) => (
                <Card key={s.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base flex items-center gap-2"><Building className="h-4 w-4 text-primary" />{s.name}</CardTitle>
                      <Badge variant="secondary" className="capitalize">{s.category}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                    {s.contactName && <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{s.contactName}</div>}
                    {s.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{s.email}</div>}
                    {s.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{s.phone}</div>}
                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-xs">{s.contractCount} {s.contractCount === 1 ? "contract" : "contracten"}</span>
                      {s.userName && <Badge variant="outline" className="text-xs">Portaalaccount: {s.userName}</Badge>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
