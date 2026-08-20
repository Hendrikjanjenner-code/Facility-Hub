import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "@/i18n";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListKeys,
  useCreateKey,
  useGetStructure,
  getListKeysQueryKey,
} from "@workspace/api-client-react";
import { KeyRound, CreditCard, Plus, Search, Clock } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const KEY_STATUS_STYLES: Record<string, string> = {
  beschikbaar: "bg-green-100 text-green-800",
  uitgegeven: "bg-blue-100 text-blue-800",
  vermist: "bg-red-100 text-red-800",
  geblokkeerd: "bg-slate-200 text-slate-700",
};

function isOverdue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

function NieuweSleutelDialog() {
  const { t } = useTranslation("sleutelbeheer");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"sleutel" | "pas">("sleutel");
  const [description, setDescription] = useState("");
  const [buildingId, setBuildingId] = useState<string>("none");
  const [replacementCost, setReplacementCost] = useState("");
  const createKey = useCreateKey();
  const { data: structure } = useGetStructure();

  const buildings =
    structure?.flatMap((org) => org.sites.flatMap((s) => s.buildings.map((b) => ({ id: b.id, name: b.name })))) ?? [];

  const submit = () => {
    if (!code.trim() || !description.trim()) {
      toast({ title: t("toast.codeDescRequired"), variant: "destructive" });
      return;
    }
    createKey.mutate(
      {
        data: {
          code: code.trim(),
          type,
          description: description.trim(),
          buildingId: buildingId === "none" ? null : Number(buildingId),
          replacementCost: replacementCost ? Number(replacementCost) : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
          toast({ title: t("toast.added") });
          setOpen(false);
          setCode(""); setDescription(""); setReplacementCost(""); setBuildingId("none");
        },
        onError: (e: any) =>
          toast({ title: e?.response?.data?.message ?? t("toast.addFailed"), variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-nieuwe-sleutel"><Plus className="h-4 w-4 mr-1.5" /> {t("newKey")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newDialog.title")}</DialogTitle>
          <DialogDescription>{t("newDialog.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="k-code">{t("newDialog.code")}</Label>
            <Input id="k-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("newDialog.codePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("newDialog.type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sleutel">{t("type.sleutel")}</SelectItem>
                <SelectItem value="pas">{t("type.pas")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="k-desc">{t("newDialog.descriptionLabel")}</Label>
            <Input id="k-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("newDialog.descriptionPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("newDialog.building")}</Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("newDialog.none")}</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="k-cost">{t("newDialog.replacementCost")}</Label>
            <Input id="k-cost" type="number" min={0} value={replacementCost} onChange={(e) => setReplacementCost(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
          <Button onClick={submit} disabled={createKey.isPending}>{t("newDialog.add")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SleutelbeheerPage() {
  const { t } = useTranslation("sleutelbeheer");
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [typeFilter, setTypeFilter] = useState<string>("alle");
  const [overdueFilter, setOverdueFilter] = useState(false);
  const [search, setSearch] = useState("");

  const queryParams = {
    ...(statusFilter !== "alle" ? { status: statusFilter } : {}),
    ...(typeFilter !== "alle" ? { type: typeFilter } : {}),
    ...(overdueFilter ? { overdue: true } : {}),
  };

  const { data: keys, isLoading } = useListKeys(queryParams, {
    query: { queryKey: getListKeysQueryKey(queryParams) },
  });

  const filtered = (keys ?? []).filter((k) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      k.code.toLowerCase().includes(q) ||
      k.description.toLowerCase().includes(q) ||
      (k.currentHolderName ?? "").toLowerCase().includes(q)
    );
  });

  const counts = {
    totaal: keys?.length ?? 0,
    uitgegeven: keys?.filter((k) => k.status === "uitgegeven").length ?? 0,
    telaat: keys?.filter((k) => isOverdue(k.dueAt)).length ?? 0,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <NieuweSleutelDialog />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{counts.totaal}</div><div className="text-xs text-muted-foreground">{t("stats.inRegister")}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{counts.uitgegeven}</div><div className="text-xs text-muted-foreground">{t("stats.issued")}</div></CardContent></Card>
        <Card
          className={cn("cursor-pointer transition-colors", overdueFilter && "ring-2 ring-orange-400")}
          onClick={() => setOverdueFilter((v) => !v)}
        >
          <CardContent className="pt-6">
            <div className={cn("text-2xl font-bold", counts.telaat > 0 && "text-orange-600")}>{counts.telaat}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> {t("stats.overdue")}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-zoek-sleutel" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">{t("filters.allTypes")}</SelectItem>
            <SelectItem value="sleutel">{t("filters.keys")}</SelectItem>
            <SelectItem value="pas">{t("filters.passes")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">{t("filters.allStatuses")}</SelectItem>
            <SelectItem value="beschikbaar">{t("status.beschikbaar")}</SelectItem>
            <SelectItem value="uitgegeven">{t("status.uitgegeven")}</SelectItem>
            <SelectItem value="vermist">{t("status.vermist")}</SelectItem>
            <SelectItem value="geblokkeerd">{t("status.geblokkeerd")}</SelectItem>
          </SelectContent>
        </Select>
        {overdueFilter && (
          <Badge variant="secondary" className="bg-orange-100 text-orange-800 gap-1">
            <Clock className="h-3 w-3" /> {t("filters.overdueBadge")}
            <button onClick={() => setOverdueFilter(false)} className="ml-1 text-orange-600 hover:text-orange-800">×</button>
          </Badge>
        )}
      </div>

      <Card>
        {isLoading ? (
          <CardContent className="p-6 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.code")}</TableHead>
                <TableHead>{t("table.type")}</TableHead>
                <TableHead>{t("table.description")}</TableHead>
                <TableHead>{t("table.building")}</TableHead>
                <TableHead>{t("table.doors")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
                <TableHead>{t("table.currentHolder")}</TableHead>
                <TableHead>{t("table.dueBy")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("table.empty")}</TableCell></TableRow>
              ) : (
                filtered.map((k) => {
                  const overdue = isOverdue(k.dueAt);
                  return (
                    <TableRow
                      key={k.id}
                      className={cn("cursor-pointer", overdue && "bg-orange-50 hover:bg-orange-100")}
                      onClick={() => setLocation(`/sleutelbeheer/${k.id}`)}
                      data-testid={`row-key-${k.code}`}
                    >
                      <TableCell className="font-mono font-medium">{k.code}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          {k.type === "pas" ? <CreditCard className="h-4 w-4 text-muted-foreground" /> : <KeyRound className="h-4 w-4 text-muted-foreground" />}
                          {t(`type.${k.type}`, k.type)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">{k.description}</TableCell>
                      <TableCell>{k.buildingName ?? "-"}</TableCell>
                      <TableCell>{k.doorCount}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={KEY_STATUS_STYLES[k.status] ?? ""}>{t(`status.${k.status}`, k.status)}</Badge>
                      </TableCell>
                      <TableCell>{k.currentHolderName ?? "-"}</TableCell>
                      <TableCell>
                        {k.dueAt ? (
                          <span className={cn("flex items-center gap-1 text-sm", overdue ? "text-orange-600 font-medium" : "text-muted-foreground")}>
                            {overdue && <Clock className="h-3.5 w-3.5" />}
                            {new Date(k.dueAt).toLocaleDateString(getIntlLocale())}
                            {overdue && <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px] ml-1">{t("table.overdue")}</Badge>}
                          </span>
                        ) : "-"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
