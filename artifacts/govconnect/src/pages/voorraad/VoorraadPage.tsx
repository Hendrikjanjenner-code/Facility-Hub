import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { getIntlLocale } from "@/i18n";
import {
  useListShopProducts,
  useCreateShopProduct,
  useUpdateShopProduct,
  useGetCurrentUser,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes, Plus, AlertTriangle, Loader2, PackagePlus, PackageMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PRODUCT_CATEGORIES = ["kantoorartikelen", "ict", "meubilair", "facilitair", "overig"];

const eur = (v: number) => v.toLocaleString(getIntlLocale(), { style: "currency", currency: "EUR" });

export default function VoorraadPage() {
  const { t } = useTranslation("voorraad");
  const productSchema = z.object({
    name: z.string().min(2, t("validation.nameRequired")),
    description: z.string().optional(),
    category: z.string().min(2, t("validation.categoryRequired")),
    price: z.coerce.number().min(0.01, t("validation.priceRequired")),
    unit: z.string().min(1),
    stock: z.coerce.number().int().min(0),
    minStock: z.coerce.number().int().min(0),
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<{ id: number; name: string; stock: number; minStock: number } | null>(null);
  const [newStock, setNewStock] = useState("");
  const [newMinStock, setNewMinStock] = useState("");

  const { data: products, isLoading } = useListShopProducts();
  const createProduct = useCreateShopProduct();
  const updateProduct = useUpdateShopProduct();
  const isManager = user?.role === "beheerder" || user?.role === "facilitair_manager";

  const form = useForm<z.input<typeof productSchema>, any, z.output<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", description: "", category: "", unit: "stuk", stock: 0, minStock: 0 },
  });

  const alerts = products?.filter((p) => p.belowMinStock) ?? [];
  const visible = onlyAlerts ? alerts : products ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/shop/products"] });

  const onSubmit = (values: z.output<typeof productSchema>) => {
    createProduct.mutate({ data: values as any }, {
      onSuccess: () => {
        toast({ title: t("toast.added") });
        setNewDialogOpen(false);
        form.reset();
        invalidate();
      },
      onError: () => toast({ title: t("toast.saveFailed"), variant: "destructive" }),
    });
  };

  const saveAdjustment = () => {
    if (!adjusting) return;
    updateProduct.mutate(
      { id: adjusting.id, data: { stock: Number(newStock), minStock: Number(newMinStock) } },
      {
        onSuccess: () => {
          toast({ title: t("toast.stockUpdated") });
          setAdjusting(null);
          invalidate();
        },
        onError: () => toast({ title: t("toast.updateFailed"), variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        {isManager && (
          <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />{t("addProduct")}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>{t("newProduct")}</DialogTitle>
                <DialogDescription>{t("newProductDescription")}</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>{t("fields.name")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.category")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder={t("fields.categoryPlaceholder")} /></SelectTrigger></FormControl>
                          <SelectContent>
                            {PRODUCT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(`category.${c}`)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>{t("fields.description")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-4 gap-4">
                    <FormField control={form.control} name="price" render={({ field }) => (
                      <FormItem><FormLabel>{t("fields.price")}</FormLabel><FormControl><Input type="number" step="0.01" {...field} value={(field.value as any) ?? ""} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="unit" render={({ field }) => (
                      <FormItem><FormLabel>{t("fields.unit")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="stock" render={({ field }) => (
                      <FormItem><FormLabel>{t("fields.stock")}</FormLabel><FormControl><Input type="number" {...field} value={(field.value as any) ?? 0} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="minStock" render={({ field }) => (
                      <FormItem><FormLabel>{t("fields.minStock")}</FormLabel><FormControl><Input type="number" {...field} value={(field.value as any) ?? 0} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setNewDialogOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                    <Button type="submit" disabled={createProduct.isPending}>
                      {createProduct.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save", { ns: "common" })}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            {t("alerts", { count: alerts.length, names: alerts.map((a) => a.name).join(", ") })}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch id="alerts-only" checked={onlyAlerts} onCheckedChange={setOnlyAlerts} />
        <Label htmlFor="alerts-only" className="text-sm">{t("onlyAlerts")}</Label>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : !visible.length ? (
        <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center">
          <Boxes className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">{onlyAlerts ? t("emptyAlerts") : t("emptyProducts")}</h3>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.product")}</TableHead>
                  <TableHead>{t("table.category")}</TableHead>
                  <TableHead>{t("table.price")}</TableHead>
                  <TableHead>{t("table.stock")}</TableHead>
                  <TableHead>{t("table.minimum")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="text-right">{t("table.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow key={p.id} className={cn(p.belowMinStock && "bg-amber-50/60")}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="secondary">{t(`category.${p.category}`, { defaultValue: p.category })}</Badge></TableCell>
                    <TableCell>{eur(p.price)} / {p.unit}</TableCell>
                    <TableCell className={cn("font-medium", p.belowMinStock && "text-amber-700")}>{p.stock} {p.unit}</TableCell>
                    <TableCell className="text-muted-foreground">{p.minStock} {p.unit}</TableCell>
                    <TableCell>
                      {p.belowMinStock ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-transparent">
                          <AlertTriangle className="mr-1 h-3 w-3" />{t("status.belowMin")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 border-transparent">{t("status.onTarget")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAdjusting({ id: p.id, name: p.name, stock: p.stock, minStock: p.minStock });
                          setNewStock(String(p.stock));
                          setNewMinStock(String(p.minStock));
                        }}
                      >
                        {t("update")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={adjusting !== null} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("updateStock")}</DialogTitle>
            <DialogDescription>{adjusting?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("currentStock")}</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setNewStock(String(Math.max(0, Number(newStock) - 1)))}><PackageMinus className="h-4 w-4" /></Button>
                <Input type="number" value={newStock} onChange={(e) => setNewStock(e.target.value)} className="text-center" />
                <Button variant="outline" size="icon" onClick={() => setNewStock(String(Number(newStock) + 1))}><PackagePlus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("minStockLabel")}</Label>
              <Input type="number" value={newMinStock} onChange={(e) => setNewMinStock(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjusting(null)}>{t("common.cancel", { ns: "common" })}</Button>
            <Button onClick={saveAdjustment} disabled={updateProduct.isPending}>
              {updateProduct.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t("common.save", { ns: "common" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
