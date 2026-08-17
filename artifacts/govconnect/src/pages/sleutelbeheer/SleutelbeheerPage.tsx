import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListKeys,
  useCreateKey,
  useGetStructure,
  getListKeysQueryKey,
} from "@workspace/api-client-react";
import { KeyRound, CreditCard, Plus, Search } from "lucide-react";

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

function NieuweSleutelDialog() {
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
      toast({ title: "Vul code en omschrijving in", variant: "destructive" });
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
          toast({ title: "Sleutel toegevoegd" });
          setOpen(false);
          setCode(""); setDescription(""); setReplacementCost(""); setBuildingId("none");
        },
        onError: (e: any) =>
          toast({ title: e?.response?.data?.message ?? "Toevoegen mislukt", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-nieuwe-sleutel"><Plus className="h-4 w-4 mr-1.5" /> Nieuwe sleutel of pas</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuwe sleutel of pas registreren</DialogTitle>
          <DialogDescription>Voeg een sleutel of toegangspas toe aan het register.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="k-code">Code</Label>
            <Input id="k-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Bijv. SL-005" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sleutel">Sleutel</SelectItem>
                <SelectItem value="pas">Pas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="k-desc">Omschrijving</Label>
            <Input id="k-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bijv. Sleutel archiefruimte" />
          </div>
          <div className="space-y-1.5">
            <Label>Gebouw</Label>
            <Select value={buildingId} onValueChange={setBuildingId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Geen / n.v.t.</SelectItem>
                {buildings.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="k-cost">Vervangingskosten (€)</Label>
            <Input id="k-cost" type="number" min={0} value={replacementCost} onChange={(e) => setReplacementCost(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={createKey.isPending}>Toevoegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SleutelbeheerPage() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [typeFilter, setTypeFilter] = useState<string>("alle");
  const [search, setSearch] = useState("");

  const { data: keys, isLoading } = useListKeys(
    {
      ...(statusFilter !== "alle" ? { status: statusFilter } : {}),
      ...(typeFilter !== "alle" ? { type: typeFilter } : {}),
    },
    { query: { queryKey: getListKeysQueryKey({
      ...(statusFilter !== "alle" ? { status: statusFilter } : {}),
      ...(typeFilter !== "alle" ? { type: typeFilter } : {}),
    }) } },
  );

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
    vermist: keys?.filter((k) => k.status === "vermist").length ?? 0,
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sleutel- en pasbeheer</h1>
          <p className="text-muted-foreground">Register, sleutelplan, uitgifte en verliesprocedure.</p>
        </div>
        <NieuweSleutelDialog />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{counts.totaal}</div><div className="text-xs text-muted-foreground">In register</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{counts.uitgegeven}</div><div className="text-xs text-muted-foreground">Uitgegeven</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className={cn("text-2xl font-bold", counts.vermist > 0 && "text-red-600")}>{counts.vermist}</div><div className="text-xs text-muted-foreground">Vermist</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Zoek op code, omschrijving of houder..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-zoek-sleutel" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle types</SelectItem>
            <SelectItem value="sleutel">Sleutels</SelectItem>
            <SelectItem value="pas">Passen</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            <SelectItem value="beschikbaar">Beschikbaar</SelectItem>
            <SelectItem value="uitgegeven">Uitgegeven</SelectItem>
            <SelectItem value="vermist">Vermist</SelectItem>
            <SelectItem value="geblokkeerd">Geblokkeerd</SelectItem>
          </SelectContent>
        </Select>
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
                <TableHead>Code</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Omschrijving</TableHead>
                <TableHead>Gebouw</TableHead>
                <TableHead>Deuren</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Huidige houder</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Geen sleutels gevonden.</TableCell></TableRow>
              ) : (
                filtered.map((k) => (
                  <TableRow key={k.id} className="cursor-pointer" onClick={() => setLocation(`/sleutelbeheer/${k.id}`)} data-testid={`row-key-${k.code}`}>
                    <TableCell className="font-mono font-medium">{k.code}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 capitalize">
                        {k.type === "pas" ? <CreditCard className="h-4 w-4 text-muted-foreground" /> : <KeyRound className="h-4 w-4 text-muted-foreground" />}
                        {k.type}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate">{k.description}</TableCell>
                    <TableCell>{k.buildingName ?? "-"}</TableCell>
                    <TableCell>{k.doorCount}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={KEY_STATUS_STYLES[k.status] ?? ""}>{k.status}</Badge>
                    </TableCell>
                    <TableCell>{k.currentHolderName ?? "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
