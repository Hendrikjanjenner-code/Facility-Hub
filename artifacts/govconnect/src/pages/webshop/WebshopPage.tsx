import { useState } from "react";
import {
  useListShopProducts,
  useCreateShopOrder,
  useListShopOrders,
  useUpdateShopOrder,
  useListBudgets,
  useGetCurrentUser,
  getListBudgetsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Loader2, PackageCheck,
  CheckCircle2, XCircle, Wallet, ClipboardList, AlertTriangle,
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

  const isManager = user?.role === "facilitair_manager" || user?.role === "beheerder";

  const { data: products, isLoading } = useListShopProducts({
    search: search || undefined,
    category: category !== "all" ? category : undefined,
  });
  const { data: orders } = useListShopOrders();
  const { data: budgets } = useListBudgets({
    query: { queryKey: getListBudgetsQueryKey(), enabled: isManager },
  });
  const createOrder = useCreateShopOrder();
  const updateOrder = useUpdateShopOrder();

  const categories = Array.from(new Set(products?.map((p) => p.category) || []));
  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const currentYear = new Date().getFullYear();
  const myBudget = budgets?.find((b) => b.department === user?.department && b.year === currentYear);

  const addToCart = (p: { id: number; name: string; unit: string; price: number; stock: number }) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        if (existing.quantity >= p.stock) return prev;
        return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId: p.id, name: p.name, unit: p.unit, price: p.price, quantity: 1, stock: p.stock }];
    });
    toast({ title: `${p.name} toegevoegd aan winkelmandje` });
  };

  const changeQty = (productId: number, delta: number) => {
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
          toast({ title: `Bestelling ${order.number} ingediend`, description: "Je bestelling wacht op goedkeuring." });
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

  const pendingOrders = orders?.filter((o) => o.status === "ingediend") ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Webshop</h1>
          <p className="text-muted-foreground">Bestel kantoorartikelen en facilitaire producten met budgetbewaking.</p>
        </div>
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
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeQty(l.productId, 1)} disabled={l.quantity >= l.stock}><Plus className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => changeQty(l.productId, -l.quantity)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <SheetFooter className="flex-col gap-3 sm:flex-col">
              {myBudget && (
                <div className="w-full text-xs text-muted-foreground border rounded-md p-3 space-y-1">
                  <div className="flex justify-between"><span>Budget {myBudget.department} ({myBudget.year})</span><span>{eur(myBudget.amount)}</span></div>
                  <div className="flex justify-between"><span>Resterend</span><span className={cn(cartTotal > myBudget.remaining && "text-destructive font-medium")}>{eur(myBudget.remaining)}</span></div>
                  {cartTotal > myBudget.remaining && <p className="text-destructive">Let op: deze bestelling overschrijdt het resterende budget.</p>}
                </div>
              )}
              <div className="w-full flex items-center justify-between font-semibold">
                <span>Totaal</span><span>{eur(cartTotal)}</span>
              </div>
              <Button className="w-full" disabled={!cart.length || createOrder.isPending} onClick={placeOrder}>
                {createOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Bestelling indienen ter goedkeuring
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      <Tabs defaultValue="catalogus">
        <TabsList>
          <TabsTrigger value="catalogus">Catalogus</TabsTrigger>
          <TabsTrigger value="bestellingen">
            {isManager ? "Bestellingen & goedkeuring" : "Mijn bestellingen"}
            {isManager && pendingOrders.length > 0 && <Badge className="ml-2 h-5 min-w-5 justify-center rounded-full px-1">{pendingOrders.length}</Badge>}
          </TabsTrigger>
          {isManager && <TabsTrigger value="budgetten">Budgetten</TabsTrigger>}
        </TabsList>

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
                    <div className="flex items-center justify-between pt-2">
                      <span className="font-bold">{eur(p.price)} <span className="text-xs font-normal text-muted-foreground">/ {p.unit}</span></span>
                      <span className={cn("text-xs", p.stock === 0 ? "text-destructive font-medium" : p.belowMinStock ? "text-amber-600" : "text-muted-foreground")}>
                        {p.stock === 0 ? "Niet op voorraad" : `${p.stock} ${p.unit} op voorraad`}
                      </span>
                    </div>
                  </CardContent>
                  <div className="p-4 pt-0">
                    <Button className="w-full" variant="secondary" disabled={p.stock === 0} onClick={() => addToCart(p)}>
                      <ShoppingCart className="mr-2 h-4 w-4" />In winkelmandje
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

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
                        <TableCell className="text-sm text-muted-foreground max-w-[260px]">
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
                          <TableCell className="text-right space-x-1 whitespace-nowrap">
                            {o.status === "ingediend" && (
                              <>
                                <Button size="sm" variant="outline" className="text-green-700" disabled={updateOrder.isPending} onClick={() => decideOrder(o.id, "goedgekeurd")}>
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />Goedkeuren
                                </Button>
                                <Button size="sm" variant="outline" className="text-destructive" disabled={updateOrder.isPending} onClick={() => setRejectOrderId(o.id)}>
                                  <XCircle className="mr-1 h-3.5 w-3.5" />Afkeuren
                                </Button>
                              </>
                            )}
                            {o.status === "goedgekeurd" && (
                              <Button size="sm" variant="outline" disabled={updateOrder.isPending} onClick={() => decideOrder(o.id, "besteld")}>Markeer besteld</Button>
                            )}
                            {o.status === "besteld" && (
                              <Button size="sm" variant="outline" disabled={updateOrder.isPending} onClick={() => decideOrder(o.id, "geleverd")}>
                                <PackageCheck className="mr-1 h-3.5 w-3.5" />Geleverd
                              </Button>
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

        {isManager && (
          <TabsContent value="budgetten" className="pt-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {budgets?.map((b) => {
                const pct = Math.min(100, Math.round((b.spent / b.amount) * 100));
                return (
                  <Card key={b.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-primary" />{b.department}
                        <span className="ml-auto text-xs font-normal text-muted-foreground">{b.year}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Progress value={pct} className={cn(pct >= 90 && "[&>div]:bg-destructive")} />
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Besteed: {eur(b.spent)}</span>
                        <span className={cn("font-medium", b.remaining < 0 && "text-destructive")}>Resterend: {eur(b.remaining)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Budget: {eur(b.amount)}</span>
                        {b.pending > 0 && <span>In aanvraag: {eur(b.pending)}</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        )}
      </Tabs>

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
    </div>
  );
}
