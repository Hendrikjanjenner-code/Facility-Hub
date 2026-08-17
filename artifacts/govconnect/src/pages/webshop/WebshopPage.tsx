import { useState } from "react";
import {
  useListShopProducts,
  useCreateShopOrder,
  useListShopOrders,
  useUpdateShopOrder,
  useListBudgets,
  useUpdateBudgetPolicy,
  useGetCurrentUser,
  useListSuppliers,
  getListBudgetsQueryKey,
  getListSuppliersQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Loader2, PackageCheck,
  CheckCircle2, XCircle, Wallet, ClipboardList, AlertTriangle, Send,
  Settings, Truck, CheckCheck, ShieldCheck, ShieldAlert,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CartLine = { productId: number; name: string; unit: string; price: number; quantity: number; stock: number };

const eur = (v: number) => v.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

function orderStatusBadge(status: string) {
  switch (status) {
    case "ingediend": return "bg-blue-100 text-blue-800";
    case "goedgekeurd": return "bg-green-100 text-green-800";
    case "afgekeurd": return "bg-red-100 text-red-800";
    case "besteld": return "bg-violet-100 text-violet-800";
    case "geleverd": return "bg-emerald-100 text-emerald-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function supplierStatusBadge(status: string | null | undefined) {
  if (!status) return null;
  if (status === "verstuurd") return <Badge className="bg-violet-100 text-violet-800 border-transparent text-xs">Verstuurd</Badge>;
  if (status === "verwerkt") return <Badge className="bg-emerald-100 text-emerald-800 border-transparent text-xs">Verwerkt</Badge>;
  return null;
}

export default function WebshopPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [sendDialogOrderId, setSendDialogOrderId] = useState<number | null>(null);
  const [sendSupplierId, setSendSupplierId] = useState<string>("");
  const [newThreshold, setNewThreshold] = useState<string>("");
  const [thresholdDialogOpen, setThresholdDialogOpen] = useState(false);

  const isManager = user?.role === "facilitair_manager" || user?.role === "beheerder";
  const isLeverancier = user?.role === "leverancier";

  const { data: products, isLoading } = useListShopProducts({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
  });
  const { data: orders } = useListShopOrders();
  const { data: budgets } = useListBudgets({
    query: { queryKey: getListBudgetsQueryKey() },
  });
  const { data: threshold } = useQuery<{ thresholdAmount: number }>({
    queryKey: ["/api/shop/approval-threshold"],
    queryFn: () => fetch("/api/shop/approval-threshold", { credentials: "include" }).then((r) => r.json()),
    enabled: isManager,
  });
  const { data: suppliers } = useListSuppliers({
    query: { queryKey: getListSuppliersQueryKey(), enabled: isManager },
  });
  const createOrder = useCreateShopOrder();
  const updateOrder = useUpdateShopOrder();
  const updatePolicy = useUpdateBudgetPolicy();
  const sendToSupplier = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { supplierId: number } }) =>
      fetch(`/api/shop/orders/${id}/send-to-supplier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      }).then(async (r) => { if (!r.ok) throw { data: await r.json() }; return r.json(); }),
  });
  const markDelivered = useMutation({
    mutationFn: ({ id }: { id: number }) =>
      fetch(`/api/shop/orders/${id}/mark-delivered`, {
        method: "POST",
        credentials: "include",
      }).then(async (r) => { if (!r.ok) throw { data: await r.json() }; return r.json(); }),
  });
  const updateThreshold = useMutation({
    mutationFn: ({ data }: { data: { thresholdAmount: number } }) =>
      fetch("/api/shop/approval-threshold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      }).then(async (r) => { if (!r.ok) throw await r.json(); return r.json(); }),
  });

  const categories = Array.from(new Set(products?.map((p) => p.category) || []));
  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const currentYear = new Date().getFullYear();
  const myBudget = budgets?.find((b) => b.department === user?.department && b.year === currentYear);

  const budgetShortfall = myBudget ? cartTotal - myBudget.remaining : 0;
  const isBlocked = !!(myBudget && myBudget.overBudgetPolicy === "blokkeren" && cartTotal > myBudget.remaining);

  const addToCart = (p: { id: number; name: string; unit: string; price: number; stock: number }) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        if (existing.quantity >= p.stock) return prev;
        return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId: p.id, name: p.name, unit: p.unit, price: p.price, quantity: 1, stock: p.stock }];
    });

    // Check if adding this product would exceed the budget with a blocking policy
    if (myBudget && myBudget.overBudgetPolicy === "blokkeren") {
      const existingLine = cart.find((l) => l.productId === p.id);
      const addedQty = existingLine ? 1 : 1;
      const newTotal = cartTotal + p.price * addedQty;
      if (newTotal > myBudget.remaining) {
        toast({
          title: `${p.name} toegevoegd aan winkelmandje`,
          description: `⚠️ Je winkelmandje overschrijdt het resterende budget (${eur(myBudget.remaining)}). Bestellen is geblokkeerd totdat het budget is aangepast.`,
          variant: "destructive",
        });
        return;
      }
    }

    toast({ title: `${p.name} toegevoegd aan winkelmandje` });
  };

  const changeQty = (productId: number, delta: number) => {
    if (delta > 0 && myBudget && myBudget.overBudgetPolicy === "blokkeren") {
      const line = cart.find((l) => l.productId === productId);
      if (line) {
        const newTotal = cartTotal + line.price * delta;
        if (newTotal > myBudget.remaining) {
          toast({
            title: "Hoeveelheid niet verhoogd",
            description: `Verhogen overschrijdt het resterende budget (${eur(myBudget.remaining)}). Het tekort wordt ${eur(newTotal - myBudget.remaining)}. Neem contact op met je manager om het budget aan te passen.`,
            variant: "destructive",
          });
          return;
        }
      }
    }
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: Math.min(l.stock, l.quantity + delta) } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const placeOrder = () => {
    createOrder.mutate(
      { data: { lines: cart.map((l) => ({ productId: l.productId, quantity: l.quantity })) } },
      {
        onSuccess: (order) => {
          const autoApproved = order.status === "goedgekeurd";
          toast({
            title: autoApproved
              ? `Bestelling ${order.number} automatisch goedgekeurd`
              : `Bestelling ${order.number} ingediend`,
            description: autoApproved
              ? `Bestelling onder drempel van ${threshold ? eur(threshold.thresholdAmount) : "—"}, direct goedgekeurd.`
              : "Je bestelling wacht op goedkeuring.",
          });
          setCart([]);
          setCartOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/shop/orders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
        },
        onError: (err: any) => toast({ title: "Bestellen mislukt", description: err?.data?.message, variant: "destructive" }),
      },
    );
  };

  const decideOrder = (id: number, status: string, decisionNote?: string) => {
    updateOrder.mutate(
      { id, data: { status, decisionNote: decisionNote ?? null } },
      {
        onSuccess: () => {
          toast({ title: `Bestelling ${status}` });
          setRejectOrderId(null);
          setRejectNote("");
          queryClient.invalidateQueries({ queryKey: ["/api/shop/orders"] });
          queryClient.invalidateQueries({ queryKey: ["/api/shop/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
        },
        onError: (err: any) => toast({ title: "Actie mislukt", description: err?.data?.message, variant: "destructive" }),
      },
    );
  };

  const handleSendToSupplier = () => {
    if (!sendDialogOrderId || !sendSupplierId) return;
    sendToSupplier.mutate(
      { id: sendDialogOrderId, data: { supplierId: parseInt(sendSupplierId) } },
      {
        onSuccess: () => {
          toast({ title: "Bestelling verstuurd naar leverancier" });
          setSendDialogOrderId(null);
          setSendSupplierId("");
          queryClient.invalidateQueries({ queryKey: ["/api/shop/orders"] });
        },
        onError: (err: any) => toast({ title: "Versturen mislukt", description: err?.data?.message, variant: "destructive" }),
      },
    );
  };

  const handleMarkDelivered = (id: number) => {
    markDelivered.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Bestelling gemarkeerd als verwerkt" });
          queryClient.invalidateQueries({ queryKey: ["/api/shop/orders"] });
        },
        onError: (err: any) => toast({ title: "Mislukt", description: err?.data?.message, variant: "destructive" }),
      },
    );
  };

  const handleSaveThreshold = () => {
    const amount = parseFloat(newThreshold);
    if (isNaN(amount) || amount < 0) return;
    updateThreshold.mutate(
      { data: { thresholdAmount: amount } },
      {
        onSuccess: () => {
          toast({ title: `Goedkeuringsdrempel ingesteld op ${eur(amount)}` });
          setThresholdDialogOpen(false);
          setNewThreshold("");
          queryClient.invalidateQueries({ queryKey: ["/api/shop/approval-threshold"] });
        },
        onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
      },
    );
  };

  const pendingOrders = orders?.filter((o) => o.status === "ingediend") ?? [];
  const supplierOrders = isLeverancier ? (orders ?? []) : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webshop</h1>
          <p className="text-muted-foreground">
            {isLeverancier
              ? "Bestellingen die naar u zijn verstuurd."
              : "Bestel kantoorartikelen en facilitaire producten met budgetbewaking."}
          </p>
        </div>

        {!isLeverancier && (
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="relative">
                <ShoppingCart className="mr-2 h-4 w-4" />
                Winkelmandje
                {cartCount > 0 && (
                  <Badge className="ml-2 h-5 min-w-5 justify-center rounded-full px-1">{cartCount}</Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col">
              <SheetHeader><SheetTitle>Winkelmandje</SheetTitle></SheetHeader>
              <div className="flex-1 overflow-auto py-4 space-y-3">
                {!cart.length ? (
                  <p className="text-sm text-muted-foreground text-center py-12">Je winkelmandje is leeg.</p>
                ) : (
                  cart.map((l) => (
                    <div key={l.productId} className="flex items-center justify-between gap-2 border rounded-md p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{eur(l.price)} per {l.unit}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeQty(l.productId, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-6 text-center text-sm">{l.quantity}</span>
                        {(() => {
                          const wouldBlock =
                            myBudget &&
                            myBudget.overBudgetPolicy === "blokkeren" &&
                            cartTotal + l.price > myBudget.remaining;
                          return (
                            <Button
                              variant="outline"
                              size="icon"
                              className={cn("h-7 w-7", wouldBlock && "border-orange-400 text-orange-500 hover:border-orange-500 hover:text-orange-600")}
                              onClick={() => changeQty(l.productId, 1)}
                              disabled={l.quantity >= l.stock}
                              title={wouldBlock ? "Verhogen overschrijdt het budget" : undefined}
                            >
                              {wouldBlock ? <AlertTriangle className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </Button>
                          );
                        })()}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => changeQty(l.productId, -l.quantity)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <SheetFooter className="flex-col gap-3 sm:flex-col">
                {myBudget && (
                  <div className="w-full text-xs text-muted-foreground border rounded-md p-3 space-y-2">
                    <div className="flex justify-between"><span>Budget {myBudget.department} ({myBudget.year})</span><span>{eur(myBudget.amount)}</span></div>
                    <div className="flex justify-between"><span>Resterend budget</span><span className={cn(cartTotal > myBudget.remaining && "text-destructive font-medium")}>{eur(myBudget.remaining)}</span></div>
                    {cart.length > 0 && (() => {
                      const pct = myBudget.remaining > 0 ? Math.min((cartTotal / myBudget.remaining) * 100, 100) : 100;
                      const overBudget = cartTotal > myBudget.remaining;
                      const nearBudget = !overBudget && cartTotal > myBudget.remaining * 0.8;
                      const barColor = overBudget ? "bg-red-500" : nearBudget ? "bg-amber-500" : "bg-green-500";
                      const labelColor = overBudget ? "text-destructive font-medium" : nearBudget ? "text-amber-600 font-medium" : "";
                      return (
                        <div className="space-y-1 pt-0.5">
                          <div className="flex justify-between">
                            <span>Winkelmandje</span>
                            <span className={cn(labelColor)}>{eur(cartTotal)}</span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all duration-300", barColor)}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {!overBudget && (
                            <p className={cn(nearBudget ? "text-amber-600" : "text-muted-foreground")}>
                              {nearBudget ? "Bijna op budget — " : ""}
                              Nog {eur(myBudget.remaining - cartTotal)} beschikbaar na indienen.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                    {cartTotal > myBudget.remaining && !isBlocked && <p className="text-amber-600">Let op: deze bestelling overschrijdt het resterende budget.</p>}
                  </div>
                )}
                {isBlocked && (
                  <div className="w-full rounded-md border border-destructive/40 bg-destructive/10 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      Bestelling geblokkeerd
                    </div>
                    <p className="text-xs text-destructive leading-snug">
                      Het resterende budget is onvoldoende voor deze bestelling. Het tekort bedraagt <strong>{eur(budgetShortfall)}</strong>.
                      Neem contact op met je manager om het budget te verhogen of het beleid aan te passen.
                    </p>
                  </div>
                )}
                {threshold && threshold.thresholdAmount > 0 && cartTotal <= threshold.thresholdAmount && (
                  <div className="w-full text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2 flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Onder drempel van {eur(threshold.thresholdAmount)} — wordt automatisch goedgekeurd
                  </div>
                )}
                <div className="w-full flex items-center justify-between font-semibold">
                  <span>Totaal</span><span>{eur(cartTotal)}</span>
                </div>
                <Button className="w-full" disabled={!cart.length || createOrder.isPending || isBlocked} onClick={placeOrder}>
                  {createOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {threshold && threshold.thresholdAmount > 0 && cartTotal <= threshold.thresholdAmount
                    ? "Bestelling plaatsen (automatisch goedgekeurd)"
                    : "Bestelling indienen ter goedkeuring"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* Leverancier portal */}
      {isLeverancier && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              Bestellingen voor u
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!supplierOrders.length ? (
              <div className="text-center py-16 text-muted-foreground">
                <Truck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nog geen bestellingen verstuurd.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bestelling</TableHead>
                    <TableHead>Artikelen</TableHead>
                    <TableHead>Bedrag</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <div className="font-medium">{o.number}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(o.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                        {o.lines.map((l) => `${l.quantity}× ${l.productName}`).join(", ")}
                      </TableCell>
                      <TableCell className="font-medium">{eur(o.totalAmount)}</TableCell>
                      <TableCell>{supplierStatusBadge((o as any).supplierStatus)}</TableCell>
                      <TableCell className="text-right">
                        {(o as any).supplierStatus === "verstuurd" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-700"
                            disabled={markDelivered.isPending}
                            onClick={() => handleMarkDelivered(o.id)}
                          >
                            <CheckCheck className="mr-1 h-3.5 w-3.5" />Geleverd markeren
                          </Button>
                        )}
                        {(o as any).supplierStatus === "verwerkt" && (
                          <span className="text-xs text-muted-foreground">Verwerkt</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Internal tabs */}
      {!isLeverancier && (
        <Tabs defaultValue="catalogus">
          <TabsList>
            <TabsTrigger value="catalogus">Catalogus</TabsTrigger>
            <TabsTrigger value="bestellingen">
              {isManager ? "Bestellingen & goedkeuring" : "Mijn bestellingen"}
              {isManager && pendingOrders.length > 0 && <Badge className="ml-2 h-5 min-w-5 justify-center rounded-full px-1">{pendingOrders.length}</Badge>}
            </TabsTrigger>
            {isManager && <TabsTrigger value="budgetten">Budgetten</TabsTrigger>}
          </TabsList>

          {/* Catalogus */}
          <TabsContent value="catalogus" className="space-y-4 pt-4">
            <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border shadow-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Zoeken in de catalogus..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder="Alle categorieën" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle categorieën</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {products?.map((p) => (
                  <Card key={p.id} className="flex flex-col">
                    <CardContent className="p-4 flex-1 space-y-2">
                      <div className="flex justify-between items-start">
                        <h3 className="font-semibold leading-tight">{p.name}</h3>
                        <Badge variant="secondary" className="capitalize ml-2 whitespace-nowrap">{p.category}</Badge>
                      </div>
                      {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                      {(p as any).supplierName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Truck className="h-3 w-3" />{(p as any).supplierName}
                        </p>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        <span className="font-bold">{eur(p.price)} <span className="text-xs font-normal text-muted-foreground">/ {p.unit}</span></span>
                        <span className={cn("text-xs", p.stock === 0 ? "text-destructive font-medium" : p.belowMinStock ? "text-amber-600" : "text-muted-foreground")}>
                          {p.stock === 0 ? "Niet op voorraad" : `${p.stock} ${p.unit} op voorraad`}
                        </span>
                      </div>
                    </CardContent>
                    <div className="p-4 pt-0">
                      {(() => {
                        const wouldExceedBlocked =
                          myBudget &&
                          myBudget.overBudgetPolicy === "blokkeren" &&
                          cartTotal + p.price > myBudget.remaining;
                        return (
                          <Button
                            className="w-full"
                            variant={wouldExceedBlocked ? "outline" : "secondary"}
                            disabled={p.stock === 0}
                            onClick={() => addToCart(p)}
                          >
                            {wouldExceedBlocked ? (
                              <AlertTriangle className="mr-2 h-4 w-4 text-destructive" />
                            ) : (
                              <ShoppingCart className="mr-2 h-4 w-4" />
                            )}
                            In winkelmandje
                          </Button>
                        );
                      })()}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Bestellingen */}
          <TabsContent value="bestellingen" className="pt-4">
            {!orders?.length ? (
              <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center">
                <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Nog geen bestellingen</h3>
              </div>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bestelling</TableHead>
                        {isManager && <TableHead>Aanvrager</TableHead>}
                        <TableHead>Artikelen</TableHead>
                        <TableHead>Bedrag</TableHead>
                        {isManager && <TableHead>Budgeteffect</TableHead>}
                        <TableHead>Status</TableHead>
                        {isManager && <TableHead>Leverancier</TableHead>}
                        {isManager && <TableHead className="text-right">Actie</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => {
                        const deptBudget = budgets?.find((b) => b.department === o.department && b.year === currentYear);
                        return (
                          <TableRow key={o.id} className={cn(isManager && o.budgetExceeded && o.status === "ingediend" && "bg-red-50/50")}>
                            <TableCell>
                              <div className="font-medium">{o.number}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(o.createdAt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </TableCell>
                            {isManager && (
                              <TableCell>
                                <div className="text-sm">{o.requesterName}</div>
                                <div className="text-xs text-muted-foreground">{o.department}</div>
                              </TableCell>
                            )}
                            <TableCell className="text-sm text-muted-foreground max-w-[220px]">
                              {o.lines.map((l) => `${l.quantity}× ${l.productName}`).join(", ")}
                            </TableCell>
                            <TableCell className="font-medium">{eur(o.totalAmount)}</TableCell>
                            {isManager && (
                              <TableCell>
                                {deptBudget ? (
                                  <div className="text-xs space-y-0.5">
                                    <div className={cn("font-medium", deptBudget.remaining < 0 ? "text-destructive" : deptBudget.remaining < o.totalAmount ? "text-amber-600" : "text-muted-foreground")}>
                                      Resterend: {eur(deptBudget.remaining)}
                                    </div>
                                    {o.budgetExceeded && (
                                      <div className="flex items-center gap-1 text-destructive font-medium">
                                        <AlertTriangle className="h-3 w-3" />
                                        Boven budget
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge variant="secondary" className={cn("capitalize border-transparent", orderStatusBadge(o.status))}>{o.status}</Badge>
                              {o.decisionNote && <div className="text-xs text-muted-foreground mt-1 max-w-[200px]">{o.decisionNote}</div>}
                            </TableCell>
                            {isManager && (
                              <TableCell>
                                {(o as any).supplierName ? (
                                  <div className="space-y-0.5">
                                    <div className="text-xs font-medium">{(o as any).supplierName}</div>
                                    {supplierStatusBadge((o as any).supplierStatus)}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            )}
                            {isManager && (
                              <TableCell className="text-right space-x-1 whitespace-nowrap">
                                {o.status === "ingediend" && (() => {
                                  const isBlocked = o.budgetExceeded && (deptBudget as any)?.overBudgetPolicy === "blokkeren";
                                  return (
                                    <div className="inline-flex flex-col items-end gap-1">
                                      <div className="space-x-1">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className={cn("text-green-700", isBlocked && "opacity-60")}
                                          disabled={updateOrder.isPending}
                                          onClick={() => decideOrder(o.id, "goedgekeurd")}
                                        >
                                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Goedkeuren
                                        </Button>
                                        <Button size="sm" variant="outline" className="text-destructive" disabled={updateOrder.isPending} onClick={() => setRejectOrderId(o.id)}>
                                          <XCircle className="mr-1 h-3.5 w-3.5" />Afkeuren
                                        </Button>
                                      </div>
                                      {isBlocked && (
                                        <p className="text-xs text-destructive flex items-center gap-1">
                                          <ShieldAlert className="h-3 w-3" />Goedkeuring geblokkeerd door budgetbeleid
                                        </p>
                                      )}
                                    </div>
                                  );
                                })()}
                                {o.status === "goedgekeurd" && (
                                  <div className="flex gap-1 justify-end">
                                    <Button size="sm" variant="outline" disabled={updateOrder.isPending} onClick={() => decideOrder(o.id, "besteld")}>Markeer besteld</Button>
                                    {!(o as any).supplierStatus && (
                                      <Button size="sm" variant="outline" className="text-violet-700" disabled={sendToSupplier.isPending} onClick={() => { setSendDialogOrderId(o.id); setSendSupplierId((o as any).supplierId?.toString() ?? ""); }}>
                                        <Send className="mr-1 h-3 w-3" />Versturen
                                      </Button>
                                    )}
                                  </div>
                                )}
                                {o.status === "besteld" && (
                                  <div className="flex gap-1 justify-end">
                                    <Button size="sm" variant="outline" disabled={updateOrder.isPending} onClick={() => decideOrder(o.id, "geleverd")}>
                                      <PackageCheck className="mr-1 h-3.5 w-3.5" />Geleverd
                                    </Button>
                                    {!(o as any).supplierStatus && (
                                      <Button size="sm" variant="outline" className="text-violet-700" disabled={sendToSupplier.isPending} onClick={() => { setSendDialogOrderId(o.id); setSendSupplierId((o as any).supplierId?.toString() ?? ""); }}>
                                        <Send className="mr-1 h-3 w-3" />Versturen
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Budgetten */}
          {isManager && (
            <TabsContent value="budgetten" className="pt-4 space-y-4">
              {/* Goedkeuringsdrempel */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" />
                      Goedkeuringsdrempel
                    </span>
                    <Button size="sm" variant="outline" onClick={() => { setNewThreshold(threshold?.thresholdAmount?.toString() ?? "0"); setThresholdDialogOpen(true); }}>
                      Aanpassen
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">
                    Bestellingen tot en met{" "}
                    <strong>{threshold ? eur(threshold.thresholdAmount) : "—"}</strong>{" "}
                    worden automatisch goedgekeurd zonder manager-beoordeling.
                    {threshold?.thresholdAmount === 0 && " (Drempel op €0 = altijd manager-goedkeuring vereist)"}
                  </p>
                </CardContent>
              </Card>

              {/* Budget per afdeling */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {budgets?.map((b) => {
                  const pct = Math.min(100, Math.round((b.spent / b.amount) * 100));
                  const isBlocking = (b as any).overBudgetPolicy === "blokkeren";
                  return (
                    <Card key={b.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-primary" />{b.department}
                          <span className="ml-auto text-xs font-normal text-muted-foreground">{b.year}</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Progress value={pct} className={cn(pct >= 90 && "[&>div]:bg-destructive")} />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Besteed: {eur(b.spent)}</span>
                          <span className={cn("font-medium", b.remaining < 0 && "text-destructive")}>Resterend: {eur(b.remaining)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Budget: {eur(b.amount)}</span>
                          {b.pending > 0 && <span>In aanvraag: {eur(b.pending)}</span>}
                        </div>
                        {b.pending > 0 && (() => {
                          const afterApproval = Math.round((b.remaining - b.pending) * 100) / 100;
                          return (
                            <div className={cn(
                              "flex items-center justify-between text-xs border-t pt-2 font-medium",
                              afterApproval < 0 ? "text-destructive" : "text-muted-foreground",
                            )}>
                              <span>Na goedkeuring alle open aanvragen</span>
                              <span>{eur(afterApproval)}</span>
                            </div>
                          );
                        })()}
                        <div className="border-t pt-2">
                          <p className="text-xs text-muted-foreground mb-1.5">Bij budgetoverschrijding:</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={!isBlocking ? "default" : "outline"}
                              className="flex-1 h-8 text-xs"
                              disabled={updatePolicy.isPending}
                              onClick={() =>
                                updatePolicy.mutate(
                                  { id: b.id, data: { overBudgetPolicy: "markeren" } },
                                  {
                                    onSuccess: () => {
                                      toast({ title: `${b.department}: beleid ingesteld op markeren` });
                                      queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
                                    },
                                    onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
                                  },
                                )
                              }
                            >
                              <ShieldCheck className="mr-1 h-3 w-3" />Markeren
                            </Button>
                            <Button
                              size="sm"
                              variant={isBlocking ? "default" : "outline"}
                              className={cn("flex-1 h-8 text-xs", isBlocking && "bg-destructive hover:bg-destructive/90")}
                              disabled={updatePolicy.isPending}
                              onClick={() =>
                                updatePolicy.mutate(
                                  { id: b.id, data: { overBudgetPolicy: "blokkeren" } },
                                  {
                                    onSuccess: () => {
                                      toast({ title: `${b.department}: beleid ingesteld op blokkeren` });
                                      queryClient.invalidateQueries({ queryKey: getListBudgetsQueryKey() });
                                    },
                                    onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
                                  },
                                )
                              }
                            >
                              <ShieldAlert className="mr-1 h-3 w-3" />Blokkeren
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Reject dialog */}
      <Dialog open={rejectOrderId !== null} onOpenChange={(open) => !open && setRejectOrderId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bestelling afkeuren</DialogTitle></DialogHeader>
          <Textarea placeholder="Reden van afkeuring (optioneel)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOrderId(null)}>Annuleren</Button>
            <Button variant="destructive" disabled={updateOrder.isPending} onClick={() => rejectOrderId && decideOrder(rejectOrderId, "afgekeurd", rejectNote || undefined)}>
              {updateOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Afkeuren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send to supplier dialog */}
      <Dialog open={sendDialogOrderId !== null} onOpenChange={(open) => !open && setSendDialogOrderId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Versturen naar leverancier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Kies leverancier</Label>
            <Select value={sendSupplierId} onValueChange={setSendSupplierId}>
              <SelectTrigger><SelectValue placeholder="Selecteer leverancier" /></SelectTrigger>
              <SelectContent>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendDialogOrderId(null)}>Annuleren</Button>
            <Button disabled={!sendSupplierId || sendToSupplier.isPending} onClick={handleSendToSupplier}>
              {sendToSupplier.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" />Versturen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Threshold dialog */}
      <Dialog open={thresholdDialogOpen} onOpenChange={setThresholdDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Goedkeuringsdrempel instellen</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Maximumbedrag voor automatische goedkeuring (€)</Label>
            <Input
              type="number"
              min="0"
              step="10"
              placeholder="bijv. 50"
              value={newThreshold}
              onChange={(e) => setNewThreshold(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Bestellingen tot en met dit bedrag worden direct goedgekeurd. Stel in op 0 om automatische goedkeuring uit te schakelen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setThresholdDialogOpen(false)}>Annuleren</Button>
            <Button disabled={updateThreshold.isPending} onClick={handleSaveThreshold}>
              {updateThreshold.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
