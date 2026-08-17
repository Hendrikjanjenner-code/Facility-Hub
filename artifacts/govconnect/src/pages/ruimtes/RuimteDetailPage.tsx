import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetRoom, 
  useListAssets,
  useListTickets,
  useListReservations,
  useUpdateRoomDossier,
  useGetCurrentUser,
  getGetRoomQueryKey,
  type Room
} from "@workspace/api-client-react";
import { useMutation, useQuery } from "@tanstack/react-query";

type DossierHistoryEntry = {
  id: number;
  changedByName: string | null;
  changedAt: string;
  isUndo: boolean;
  changes: Array<{ field: string; from: unknown; to: unknown }>;
};

const getListRoomDossierHistoryQueryKey = (roomId: number) => [`/api/rooms/${roomId}/dossier-history`];

function useListRoomDossierHistory(roomId: number, _opts?: unknown) {
  return useQuery<DossierHistoryEntry[]>({
    queryKey: getListRoomDossierHistoryQueryKey(roomId),
    queryFn: () => fetch(`/api/rooms/${roomId}/dossier-history`, { credentials: "include" }).then((r) => r.json()),
    enabled: roomId > 0,
  });
}

function useUndoRoomDossierChange() {
  return useMutation({
    mutationFn: ({ roomId, entryId }: { roomId: number; entryId: number }) =>
      fetch(`/api/rooms/${roomId}/dossier-history/${entryId}/undo`, {
        method: "POST",
        credentials: "include",
      }).then(async (r) => { if (!r.ok) throw await r.json(); return r.json(); }),
  });
}
import { 
  ArrowLeft, 
  MapPin, 
  Maximize, 
  Users, 
  PcCase, 
  Ticket, 
  CalendarDays,
  Info,
  Layers,
  LayoutGrid,
  Pencil,
  Briefcase,
  History,
  Undo2
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTicketStatusColor, getReservationStatusColor } from "@/lib/status-helpers";

function DossierEditDialog({ room }: { room: Room }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [areaM2, setAreaM2] = useState(room.areaM2?.toString() ?? "");
  const [areaVvo, setAreaVvo] = useState(room.areaVvoM2?.toString() ?? "");
  const [areaBvo, setAreaBvo] = useState(room.areaBvoM2?.toString() ?? "");
  const [department, setDepartment] = useState(room.department ?? "");
  const [functionType, setFunctionType] = useState(room.functionType ?? "");
  const update = useUpdateRoomDossier();

  const submit = () => {
    update.mutate(
      {
        id: room.id,
        data: {
          areaM2: areaM2 ? Number(areaM2) : undefined,
          areaVvoM2: areaVvo === "" ? null : Number(areaVvo),
          areaBvoM2: areaBvo === "" ? null : Number(areaBvo),
          department: department === "" ? null : department,
          functionType: functionType || undefined,
          updatedAt: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(room.id) });
          queryClient.invalidateQueries({ queryKey: getListRoomDossierHistoryQueryKey(room.id) });
          toast({ title: "Ruimtedossier bijgewerkt" });
          setOpen(false);
        },
        onError: (error) => {
          if (error.status === 409) {
            queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(room.id) });
            toast({
              title: "Ruimte ondertussen gewijzigd",
              description:
                "Iemand anders heeft deze ruimte zojuist bewerkt. De dialoog is gesloten — open hem opnieuw om de actuele waarden te zien.",
              variant: "destructive",
            });
            setOpen(false);
          } else {
            toast({ title: "Bijwerken mislukt", variant: "destructive" });
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Bewerken
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ruimtedossier bewerken</DialogTitle>
          <DialogDescription>Pas oppervlaktes, functie en afdeling van {room.name} aan.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-area">Oppervlakte (m²)</Label>
            <Input id="d-area" type="number" min={0} value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-func">Functie</Label>
            <Input id="d-func" value={functionType} onChange={(e) => setFunctionType(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-vvo">VVO (m²)</Label>
            <Input id="d-vvo" type="number" min={0} value={areaVvo} onChange={(e) => setAreaVvo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-bvo">BVO (m²)</Label>
            <Input id="d-bvo" type="number" min={0} value={areaBvo} onChange={(e) => setAreaBvo(e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="d-dept">Afdeling</Label>
            <Input id="d-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Bijv. Burgerzaken" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={update.isPending}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FIELD_LABELS: Record<string, string> = {
  functionType: "Functie",
  floorFinish: "Vloerafwerking",
  areaM2: "Oppervlakte (m²)",
  areaVvoM2: "VVO (m²)",
  areaBvoM2: "BVO (m²)",
  department: "Afdeling",
  capacity: "Capaciteit",
};
export default function RuimteDetailPage({ id }: { id: string }) {
  const roomId = parseInt(id);
  const [, setLocation] = useLocation();

  const { data: room, isLoading } = useGetRoom(roomId, { query: { enabled: !!roomId, queryKey: getGetRoomQueryKey(roomId) } });
  const { data: user } = useGetCurrentUser();
  const canEdit = user?.role === "facilitair_manager" || user?.role === "beheerder";
  
  // Fetch related data
  const { data: assets } = useListAssets({ roomId });
  const { data: tickets } = useListTickets({ search: room?.name, status: "nieuw" }); // Ideally there's a roomId filter, let's assume search works or we filter client side
  
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const { data: reservations } = useListReservations({ roomId, date: todayStr });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="md:col-span-2 h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!room) {
    return <div>Ruimte niet gevonden.</div>;
  }

  // Client side filter just in case the API search doesn't filter perfectly
  const roomTickets = tickets?.filter(t => t.roomId === room.id && t.status !== 'gesloten' && t.status !== 'gereed') || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/ruimtes")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
            <Badge variant="outline" className="font-mono bg-background">{room.code}</Badge>
            {room.bookable && <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-transparent">Boekbaar</Badge>}
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <MapPin className="h-3.5 w-3.5" />
            {room.buildingName} • {room.floorName} • {room.siteName}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" /> Ruimtedossier
                </CardTitle>
                {canEdit && <DossierEditDialog key={room.id} room={room} />}
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Maximize className="h-4 w-4" /> Oppervlakte
                  </dt>
                  <dd className="font-medium text-base">{room.areaM2} m²</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Maximize className="h-4 w-4" /> VVO
                  </dt>
                  <dd className="font-medium text-base">{room.areaVvoM2 != null ? `${room.areaVvoM2} m²` : "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Maximize className="h-4 w-4" /> BVO
                  </dt>
                  <dd className="font-medium text-base">{room.areaBvoM2 != null ? `${room.areaBvoM2} m²` : "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" /> Afdeling
                  </dt>
                  <dd className="font-medium text-base">{room.department || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> Capaciteit
                  </dt>
                  <dd className="font-medium text-base">{room.capacity || '-'} personen</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <LayoutGrid className="h-4 w-4" /> Functie
                  </dt>
                  <dd className="font-medium text-base capitalize">{room.functionType}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Layers className="h-4 w-4" /> Vloerafwerking
                  </dt>
                  <dd className="font-medium text-base">{room.floorFinish || '-'}</dd>
                </div>
              </dl>

              {room.facilities?.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h4 className="font-medium mb-3">Faciliteiten</h4>
                    <div className="flex flex-wrap gap-2">
                      {room.facilities.map(f => (
                        <Badge key={f} variant="secondary" className="font-normal">{f}</Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="assets" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="assets">
                <PcCase className="h-4 w-4 mr-2" /> Assets ({assets?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="tickets">
                <Ticket className="h-4 w-4 mr-2" /> Open meldingen ({roomTickets.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="assets" className="mt-4">
              <Card>
                <div className="divide-y">
                  {!assets?.length ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Geen assets gekoppeld aan deze ruimte.</div>
                  ) : (
                    assets.map(asset => (
                      <div key={asset.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" onClick={() => setLocation(`/assets/${asset.id}`)}>
                        <div>
                          <div className="font-medium text-sm">{asset.name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{asset.code}</div>
                        </div>
                        <Badge variant="outline">{asset.status}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="tickets" className="mt-4">
              <Card>
                <div className="divide-y">
                  {!roomTickets?.length ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">Geen openstaande meldingen.</div>
                  ) : (
                    roomTickets.map(ticket => (
                      <div key={ticket.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" onClick={() => setLocation(`/meldingen/${ticket.id}`)}>
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="font-medium text-sm truncate">{ticket.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(ticket.createdAt), "d MMM", { locale: nl })} • {ticket.categoryName}
                          </div>
                        </div>
                        <Badge variant="secondary" className={getTicketStatusColor(ticket.status)}>{ticket.status}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </TabsContent>
          </Tabs>

          {canEdit && <DossierHistoryCard roomId={room.id} />}
        </div>

        <div className="space-y-6">
          {room.bookable && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4" /> Reserveringen Vandaag
                </CardTitle>
                <CardDescription>{format(new Date(), "EEEE d MMMM", { locale: nl })}</CardDescription>
              </CardHeader>
              <CardContent>
                {!reservations?.length ? (
                  <p className="text-sm text-muted-foreground">Geen reserveringen voor vandaag.</p>
                ) : (
                  <div className="space-y-3">
                    {reservations.map(res => (
                      <div key={res.id} className="text-sm p-3 bg-muted/50 rounded-lg border flex flex-col gap-1 cursor-pointer hover:bg-muted" onClick={() => setLocation(`/reserveringen/${res.id}`)}>
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-primary">{res.startTime} - {res.endTime}</span>
                          <Badge variant="secondary" className={`text-[10px] h-4 px-1 py-0 ${getReservationStatusColor(res.status)}`}>
                            {res.status}
                          </Badge>
                        </div>
                        <span className="font-medium truncate">{res.title}</span>
                        <span className="text-xs text-muted-foreground">{res.userName}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                <Button className="w-full mt-4" variant="outline" onClick={() => setLocation("/reserveringen")}>
                  Naar planbord
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function formatValue(v: string | number | null | undefined) {
  return v === null || v === undefined || v === "" ? "leeg" : String(v);
}

function DossierHistoryCard({ roomId }: { roomId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useListRoomDossierHistory(roomId, {
    query: { queryKey: getListRoomDossierHistoryQueryKey(roomId) },
  });
  const undo = useUndoRoomDossierChange();

  const canUndo = !!history?.length && !history[0]!.isUndo;

  const doUndo = () => {
    undo.mutate(
      { roomId, entryId: history![0]!.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
          queryClient.invalidateQueries({ queryKey: getListRoomDossierHistoryQueryKey(roomId) });
          toast({ title: "Laatste wijziging ongedaan gemaakt" });
        },
        onError: () =>
          toast({ title: "Ongedaan maken mislukt", variant: "destructive" }),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Wijzigingshistorie
          </CardTitle>
          {canUndo && (
            <Button variant="outline" size="sm" onClick={doUndo} disabled={undo.isPending}>
              <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Laatste wijziging ongedaan maken
            </Button>
          )}
        </div>
        <CardDescription>Herindelingen en dossierwijzigingen van deze ruimte.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !history?.length ? (
          <p className="text-sm text-muted-foreground">Nog geen wijzigingen geregistreerd.</p>
        ) : (
          <div className="space-y-4">
            {history.map((entry: DossierHistoryEntry) => (
              <div key={entry.id} className="text-sm border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-medium">{entry.changedByName ?? "Onbekend"}</span>
                  <div className="flex items-center gap-2">
                    {entry.isUndo && (
                      <Badge variant="secondary" className="text-[10px]">Teruggedraaid</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(entry.changedAt), "d MMM yyyy HH:mm", { locale: nl })}
                    </span>
                  </div>
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {entry.changes.map((c: { field: string; from: unknown; to: unknown }, i) => (
                    <li key={i}>
                      <span className="text-foreground">{FIELD_LABELS[c.field] ?? c.field}</span>
                      : {formatValue(c.from as string | number | null)} → {formatValue(c.to as string | number | null)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
