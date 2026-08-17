import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetKey,
  useIssueKey,
  useReturnKey,
  useReportKeyLoss,
  useUpdateKey,
  useCreateKeyDoor,
  useDeleteKeyDoor,
  useListUsers,
  useListRooms,
  getGetKeyQueryKey,
  getListKeysQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  KeyRound,
  CreditCard,
  DoorClosed,
  Plus,
  Trash2,
  UserCheck,
  Undo2,
  AlertTriangle,
  History,
  Lock,
  Unlock,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { KEY_STATUS_STYLES } from "./SleutelbeheerPage";

const euro = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`;

export default function SleutelDetailPage({ id }: { id: string }) {
  const keyId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useGetKey(keyId, {
    query: { enabled: !!keyId, queryKey: getGetKeyQueryKey(keyId) },
  });
  const { data: users } = useListUsers();
  const { data: rooms } = useListRooms();

  const issueKey = useIssueKey();
  const returnKey = useReturnKey();
  const reportLoss = useReportKeyLoss();
  const updateKey = useUpdateKey();
  const createDoor = useCreateKeyDoor();
  const deleteDoor = useDeleteKeyDoor();

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueHolderId, setIssueHolderId] = useState<string>("");
  const [issueNote, setIssueNote] = useState("");

  const [lossOpen, setLossOpen] = useState(false);
  const [lossCharge, setLossCharge] = useState<string>("");
  const [lossNote, setLossNote] = useState("");

  const [doorOpen, setDoorOpen] = useState(false);
  const [doorDescription, setDoorDescription] = useState("");
  const [doorRoomId, setDoorRoomId] = useState<string>("none");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetKeyQueryKey(keyId) });
    queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
  };
  const onError = (e: any) =>
    toast({ title: e?.response?.data?.message ?? "Actie mislukt", variant: "destructive" });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!detail) return <div>Sleutel niet gevonden.</div>;

  const { key, doors, issues, lossReports } = detail;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/sleutelbeheer")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            {key.type === "pas" ? <CreditCard className="h-6 w-6 text-primary" /> : <KeyRound className="h-6 w-6 text-primary" />}
            <h1 className="text-2xl font-bold tracking-tight font-mono">{key.code}</h1>
            <Badge variant="secondary" className={KEY_STATUS_STYLES[key.status] ?? ""} data-testid="badge-key-status">{key.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {key.description} {key.buildingName ? `• ${key.buildingName}` : ""}
            {key.replacementCost != null ? ` • Vervangingskosten ${euro(key.replacementCost)}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {key.status === "beschikbaar" && (
            <>
              <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-uitgeven"><UserCheck className="h-4 w-4 mr-1.5" /> Uitgeven</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Sleutel uitgeven</DialogTitle>
                    <DialogDescription>Registreer aan wie {key.code} wordt uitgegeven.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>Medewerker</Label>
                      <Select value={issueHolderId} onValueChange={setIssueHolderId}>
                        <SelectTrigger data-testid="select-houder"><SelectValue placeholder="Kies medewerker" /></SelectTrigger>
                        <SelectContent>
                          {users?.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="i-note">Notitie (optioneel)</Label>
                      <Input id="i-note" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIssueOpen(false)}>Annuleren</Button>
                    <Button
                      disabled={!issueHolderId || issueKey.isPending}
                      onClick={() =>
                        issueKey.mutate(
                          { id: keyId, data: { holderId: Number(issueHolderId), note: issueNote || undefined } },
                          {
                            onSuccess: () => { invalidate(); toast({ title: "Sleutel uitgegeven" }); setIssueOpen(false); setIssueHolderId(""); setIssueNote(""); },
                            onError,
                          },
                        )
                      }
                      data-testid="button-bevestig-uitgifte"
                    >
                      Uitgeven
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                onClick={() =>
                  updateKey.mutate(
                    { id: keyId, data: { status: "geblokkeerd" } },
                    { onSuccess: () => { invalidate(); toast({ title: "Sleutel geblokkeerd" }); }, onError },
                  )
                }
              >
                <Lock className="h-4 w-4 mr-1.5" /> Blokkeren
              </Button>
            </>
          )}
          {key.status === "uitgegeven" && (
            <Button
              onClick={() =>
                returnKey.mutate(
                  { id: keyId },
                  { onSuccess: () => { invalidate(); toast({ title: "Sleutel ingenomen" }); }, onError },
                )
              }
              data-testid="button-innemen"
            >
              <Undo2 className="h-4 w-4 mr-1.5" /> Innemen
            </Button>
          )}
          {(key.status === "geblokkeerd" || key.status === "vermist") && (
            <Button
              variant="outline"
              onClick={() =>
                updateKey.mutate(
                  { id: keyId, data: { status: "beschikbaar" } },
                  { onSuccess: () => { invalidate(); toast({ title: "Sleutel weer beschikbaar" }); }, onError },
                )
              }
            >
              <Unlock className="h-4 w-4 mr-1.5" /> Weer beschikbaar
            </Button>
          )}
          {key.status !== "vermist" && (
            <Dialog open={lossOpen} onOpenChange={setLossOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" data-testid="button-vermist">
                  <AlertTriangle className="h-4 w-4 mr-1.5" /> Vermist melden
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Verliesprocedure starten</DialogTitle>
                  <DialogDescription>
                    De sleutel wordt als vermist geregistreerd, er wordt automatisch een servicedesk-melding aangemaakt en de kosten worden verrekend
                    {key.currentHolderName ? ` met ${key.currentHolderName}` : ""}.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="l-charge">Kostenverrekening (€)</Label>
                    <Input
                      id="l-charge"
                      type="number"
                      min={0}
                      value={lossCharge}
                      onChange={(e) => setLossCharge(e.target.value)}
                      placeholder={key.replacementCost != null ? String(key.replacementCost) : "0"}
                    />
                    <p className="text-xs text-muted-foreground">Leeg laten = vervangingskosten uit het register.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="l-note">Toelichting</Label>
                    <Input id="l-note" value={lossNote} onChange={(e) => setLossNote(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setLossOpen(false)}>Annuleren</Button>
                  <Button
                    variant="destructive"
                    disabled={reportLoss.isPending}
                    onClick={() =>
                      reportLoss.mutate(
                        { id: keyId, data: { chargeAmount: lossCharge ? Number(lossCharge) : undefined, note: lossNote || undefined } },
                        {
                          onSuccess: () => { invalidate(); toast({ title: "Verliesprocedure gestart", description: "Er is een servicedesk-melding aangemaakt." }); setLossOpen(false); setLossCharge(""); setLossNote(""); },
                          onError,
                        },
                      )
                    }
                    data-testid="button-bevestig-vermist"
                  >
                    Vermist melden
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {key.status === "uitgegeven" && key.currentHolderName && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-6 text-sm flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-blue-700" />
            Uitgegeven aan <span className="font-semibold">{key.currentHolderName}</span>
            {key.issuedAt && <> sinds {format(new Date(key.issuedAt), "d MMMM yyyy", { locale: nl })}</>}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DoorClosed className="h-4 w-4" /> Sleutelplan
                </CardTitle>
                <CardDescription>Deuren en cilinders die deze {key.type} opent.</CardDescription>
              </div>
              <Dialog open={doorOpen} onOpenChange={setDoorOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Deur</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Deur toevoegen aan sleutelplan</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="dd-desc">Omschrijving</Label>
                      <Input id="dd-desc" value={doorDescription} onChange={(e) => setDoorDescription(e.target.value)} placeholder="Bijv. Cilinder C-06, archiefdeur" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Ruimte (optioneel)</Label>
                      <Select value={doorRoomId} onValueChange={setDoorRoomId}>
                        <SelectTrigger data-testid="select-deur-ruimte"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Geen / n.v.t.</SelectItem>
                          {rooms?.map((r) => (
                            <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDoorOpen(false)}>Annuleren</Button>
                    <Button
                      disabled={!doorDescription.trim() || createDoor.isPending}
                      onClick={() =>
                        createDoor.mutate(
                          { id: keyId, data: { description: doorDescription.trim(), roomId: doorRoomId === "none" ? null : Number(doorRoomId) } },
                          {
                            onSuccess: () => { invalidate(); toast({ title: "Deur toegevoegd" }); setDoorOpen(false); setDoorDescription(""); setDoorRoomId("none"); },
                            onError,
                          },
                        )
                      }
                    >
                      Toevoegen
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {doors.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nog geen deuren gekoppeld.</div>
              ) : (
                doors.map((d) => (
                  <div key={d.id} className="p-3 px-6 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{d.description}</div>
                      {d.roomName && (
                        <button className="text-xs text-primary hover:underline" onClick={() => d.roomId && setLocation(`/ruimtes/${d.roomId}`)}>
                          {d.roomName}
                        </button>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() =>
                        deleteDoor.mutate(
                          { id: d.id },
                          { onSuccess: () => { invalidate(); toast({ title: "Deur verwijderd" }); }, onError },
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Uitgiftehistorie
            </CardTitle>
            <CardDescription>Wie deze {key.type} in gebruik had of heeft.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {issues.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">Nog niet uitgegeven.</div>
              ) : (
                issues.map((i) => (
                  <div key={i.id} className="p-3 px-6 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{i.holderName ?? "Onbekend"}</span>
                      <Badge variant={i.returnedAt ? "secondary" : "default"} className="text-[10px]">
                        {i.returnedAt ? "Ingenomen" : "In gebruik"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(i.issuedAt), "d MMM yyyy", { locale: nl })}
                      {i.returnedAt && <> – {format(new Date(i.returnedAt), "d MMM yyyy", { locale: nl })}</>}
                      {i.issuedByName && <> • uitgegeven door {i.issuedByName}</>}
                    </div>
                    {i.note && <div className="text-xs text-muted-foreground italic mt-0.5">{i.note}</div>}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {lossReports.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-red-700">
              <AlertTriangle className="h-4 w-4" /> Verliesmeldingen
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {lossReports.map((l) => (
                <div key={l.id} className="p-3 px-6 text-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span>
                      Gemeld op {format(new Date(l.createdAt), "d MMMM yyyy", { locale: nl })}
                      {l.holderName && <> • laatste houder: <span className="font-medium">{l.holderName}</span></>}
                    </span>
                    <span className="font-semibold">{euro(l.chargeAmount)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {l.reportedByName && <>Gemeld door {l.reportedByName}. </>}
                    {l.note}
                  </div>
                  {l.ticketId && (
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setLocation(`/meldingen/${l.ticketId}`)}>
                      Melding {l.ticketNumber ?? `#${l.ticketId}`} bekijken
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />
      <p className="text-xs text-muted-foreground">
        Aangemaakt op {format(new Date(key.createdAt), "d MMMM yyyy", { locale: nl })}.
      </p>
    </div>
  );
}
