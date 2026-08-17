import { useState, useRef } from "react";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const getListContractDocumentsQueryKey = (contractId: number) => [`/api/contracts/${contractId}/documents`];

function useListContractDocuments(contractId: number, opts?: { query?: { queryKey?: unknown[]; enabled?: boolean } }) {
  return useQuery<Array<{ id: number; title: string; objectPath: string; contentType: string; sizeBytes: number; uploadedByName: string | null; createdAt: string }>>({
    queryKey: opts?.query?.queryKey ?? getListContractDocumentsQueryKey(contractId),
    queryFn: () => fetch(`/api/contracts/${contractId}/documents`, { credentials: "include" }).then((r) => r.json()),
    enabled: opts?.query?.enabled ?? true,
  });
}

function useCreateContractDocument() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { fileName: string; objectPath: string } }) =>
      fetch(`/api/contracts/${id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      }).then(async (r) => { if (!r.ok) throw await r.json(); return r.json(); }),
  });
}

function useDeleteContractDocument() {
  return useMutation({
    mutationFn: ({ id, docId }: { id: number; docId: number }) =>
      fetch(`/api/contracts/${id}/documents/${docId}`, {
        method: "DELETE",
        credentials: "include",
      }).then(async (r) => { if (!r.ok && r.status !== 204) throw await r.json(); }),
  });
}

const getListSupplierReviewsQueryKey = (supplierId: number) => [`/api/suppliers/${supplierId}/reviews`];

function useListSupplierReviews(supplierId: number, _opts?: unknown) {
  return useQuery<{ reviews: Array<{ id: number; year: number; score: number; comment: string | null }>; averageScore: number | null }>({
    queryKey: getListSupplierReviewsQueryKey(supplierId),
    queryFn: () => fetch(`/api/suppliers/${supplierId}/reviews`, { credentials: "include" }).then((r) => r.json()),
    enabled: supplierId > 0,
  });
}

function useCreateSupplierReview() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { year: number; score: number; comment: string | null } }) =>
      fetch(`/api/suppliers/${id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      }).then(async (r) => { if (!r.ok) throw await r.json(); return r.json(); }),
  });
}
import {
  FileText, Plus, Building, AlertTriangle, Loader2, Phone, Mail,
  UserRound, Upload, Download, Trash2, Star, ChevronDown, ChevronUp, File,
} from "lucide-react";

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

const BASE_URL = import.meta.env.BASE_URL ?? "/";

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

const reviewSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2099),
  score: z.coerce.number().int().min(1).max(5),
  comment: z.string().optional(),
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

function StarRating({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i < score ? "fill-amber-400 text-amber-400" : "text-gray-300")}
        />
      ))}
    </div>
  );
}

// ── Contract documents panel ──────────────────────────────────────────────────

function ContractDocumentsPanel({ contractId, isManager }: { contractId: number; isManager: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data: docs, isLoading } = useListContractDocuments(contractId, {
    query: { queryKey: getListContractDocumentsQueryKey(contractId), enabled: expanded },
  });
  const createDoc = useCreateContractDocument();
  const deleteDoc = useDeleteContractDocument();

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // Step 1: upload raw bytes via /storage/document-uploads
      const res = await fetch(`${BASE_URL}api/storage/document-uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Upload mislukt");
      }
      const { objectPath } = await res.json();

      // Step 2: register the document with the contract
      createDoc.mutate(
        { id: contractId, data: { fileName: file.name, objectPath } },
        {
          onSuccess: () => {
            toast({ title: "Document geüpload" });
            queryClient.invalidateQueries({ queryKey: getListContractDocumentsQueryKey(contractId) });
          },
          onError: () => toast({ title: "Registratie mislukt", variant: "destructive" }),
          onSettled: () => setUploading(false),
        },
      );
    } catch (e: any) {
      toast({ title: e.message ?? "Upload mislukt", variant: "destructive" });
      setUploading(false);
    }
  };

  const handleDownload = (docId: number) => {
    // Use the contract-scoped download endpoint (enforces supplier ownership)
    window.open(`${BASE_URL}api/contracts/${contractId}/documents/${docId}/download`, "_blank");
  };

  const handleDelete = (docId: number) => {
    deleteDoc.mutate(
      { id: contractId, docId },
      {
        onSuccess: () => {
          toast({ title: "Document verwijderd" });
          queryClient.invalidateQueries({ queryKey: getListContractDocumentsQueryKey(contractId) });
        },
        onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="border rounded-md bg-muted/30">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/50 transition-colors rounded-md"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="flex items-center gap-2">
          <File className="h-4 w-4 text-muted-foreground" />
          Digitale kluis
          {docs && docs.length > 0 && (
            <Badge variant="secondary" className="text-xs">{docs.length}</Badge>
          )}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {isLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : !docs?.length ? (
            <p className="text-xs text-muted-foreground py-2">Nog geen documenten geüpload.</p>
          ) : (
            <div className="space-y-1">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-2 border rounded bg-background px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.uploadedByName} · {new Date(doc.createdAt).toLocaleDateString("nl-NL")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleDownload(doc.id)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {isManager && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDelete(doc.id)}
                        disabled={deleteDoc.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {isManager && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={uploading || createDoc.isPending}
                onClick={() => fileRef.current?.click()}
              >
                {(uploading || createDoc.isPending) ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                PDF uploaden
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Supplier reviews panel ────────────────────────────────────────────────────

function SupplierReviewsPanel({ supplierId, isManager }: { supplierId: number; isManager: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const { data, isLoading } = useListSupplierReviews(supplierId, {
    query: { queryKey: getListSupplierReviewsQueryKey(supplierId) },
  });
  const createReview = useCreateSupplierReview();

  const form = useForm<z.infer<typeof reviewSchema>>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { year: new Date().getFullYear(), score: 3, comment: "" },
  });

  const onSubmit = (values: z.infer<typeof reviewSchema>) => {
    setReviewError(null);
    createReview.mutate(
      { id: supplierId, data: { year: values.year, score: values.score, comment: values.comment || null } },
      {
        onSuccess: () => {
          toast({ title: "Beoordeling opgeslagen" });
          setOpen(false);
          form.reset();
          queryClient.invalidateQueries({ queryKey: getListSupplierReviewsQueryKey(supplierId) });
        },
        onError: (err: any) => {
          const msg = err?.message ?? "Opslaan mislukt";
          setReviewError(msg);
        },
      },
    );
  };

  return (
    <div className="pt-2 border-t mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium">Beoordelingen</span>
          {data?.averageScore != null && (
            <span className="text-xs text-muted-foreground">
              gem. {data.averageScore.toFixed(1)} / 5
            </span>
          )}
        </div>
        {isManager && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setReviewError(null); form.reset(); } }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" />Beoordelen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Leverancier beoordelen</DialogTitle>
                <DialogDescription>Jaarlijkse evaluatie (1–5 sterren)</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {reviewError && (
                    <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{reviewError}</p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="year" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jaar</FormLabel>
                        <FormControl><Input type="number" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="score" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Score (1–5)</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <SelectItem key={s} value={s.toString()}>
                                {"★".repeat(s)}{"☆".repeat(5 - s)} ({s})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="comment" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Toelichting (optioneel)</FormLabel>
                      <FormControl><Textarea rows={3} placeholder="Geef een toelichting op de score..." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
                    <Button type="submit" disabled={createReview.isPending}>
                      {createReview.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-8 w-full" />
      ) : !data?.reviews.length ? (
        <p className="text-xs text-muted-foreground">Nog geen beoordelingen.</p>
      ) : (
        <div className="space-y-1.5">
          {data.reviews.slice(0, 3).map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2 text-xs">
              <div>
                <StarRating score={r.score} />
                {r.comment && <p className="text-muted-foreground mt-0.5 line-clamp-2">{r.comment}</p>}
              </div>
              <span className="text-muted-foreground whitespace-nowrap">{r.year}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ContractenPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [contractDialogOpen, setContractDialogOpen] = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [expandedContractId, setExpandedContractId] = useState<number | null>(null);

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

        {/* ── Contracten tab ── */}
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
            <div className="space-y-3">
              {contracts.map((c) => {
                const isExpanded = expandedContractId === c.id;
                return (
                  <Card key={c.id} className={cn(c.expiringSoon && "border-amber-300")}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="font-semibold">{c.name}</span>
                            <Badge variant="secondary" className={cn("capitalize border-transparent text-xs", contractStatusBadge(c.status))}>{c.status}</Badge>
                            <span className="text-xs text-muted-foreground capitalize">{c.category}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {c.supplierName} · {nlDate(c.startDate)} — {nlDate(c.endDate)}
                            {c.annualValue != null && ` · ${eur(c.annualValue)}/jaar`}
                          </div>
                          {c.status === "actief" && (
                            <div className={cn("text-xs mt-1", c.expiringSoon ? "text-amber-700 font-medium" : "text-muted-foreground")}>
                              {c.expiringSoon && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                              nog {c.daysUntilEnd} dagen{c.expiringSoon ? ` (opzegtermijn ${c.noticePeriodDays} dgn)` : ""}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 items-center shrink-0">
                          {isManager && c.status === "actief" && (
                            <Button variant="outline" size="sm" onClick={() => terminate(c.id)} disabled={updateContract.isPending}>
                              Opzeggen
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedContractId(isExpanded ? null : c.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t">
                          {c.description && (
                            <p className="text-sm text-muted-foreground mb-4">{c.description}</p>
                          )}
                          <ContractDocumentsPanel contractId={c.id} isManager={isManager} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Leveranciers tab ── */}
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
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building className="h-4 w-4 text-primary" />{s.name}
                      </CardTitle>
                      <Badge variant="secondary" className="capitalize">{s.category}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1.5 text-sm text-muted-foreground">
                    {s.contactName && <div className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5" />{s.contactName}</div>}
                    {s.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{s.email}</div>}
                    {s.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{s.phone}</div>}
                    <div className="pt-1 flex items-center justify-between">
                      <span className="text-xs">{s.contractCount} {s.contractCount === 1 ? "contract" : "contracten"}</span>
                      {s.userName && <Badge variant="outline" className="text-xs">Portaal: {s.userName}</Badge>}
                    </div>
                    <SupplierReviewsPanel supplierId={s.id} isManager={isManager} />
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
