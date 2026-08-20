import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetRoom, 
  useListAssets,
  useListTickets,
  useListReservations,
  useUpdateRoomDossier,
  useGetCurrentUser,
  getGetRoomQueryKey,
  useListRoomDossierHistory,
  getListRoomDossierHistoryQueryKey,
  useUndoRoomDossierEntry,
  type Room,
  type UndoRoomDossierEntryResult,
} from "@workspace/api-client-react";
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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTicketStatusColor, getReservationStatusColor } from "@/lib/status-helpers";

function DossierEditDialog({ room }: { room: Room }) {
  const { t } = useTranslation("ruimtes");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [areaM2, setAreaM2] = useState(room.areaM2?.toString() ?? "");
  const [areaVvo, setAreaVvo] = useState(room.areaVvoM2?.toString() ?? "");
  const [areaBvo, setAreaBvo] = useState(room.areaBvoM2?.toString() ?? "");
  const [department, setDepartment] = useState(room.department ?? "");
  const [functionType, setFunctionType] = useState(room.functionType ?? "");
  const [capacity, setCapacity] = useState(room.capacity?.toString() ?? "");
  const [bookable, setBookable] = useState(room.bookable ?? false);
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
          capacity: capacity === "" ? null : Number(capacity),
          bookable,
          updatedAt: room.updatedAt ?? "",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(room.id) });
          queryClient.invalidateQueries({ queryKey: getListRoomDossierHistoryQueryKey(room.id) });
          toast({ title: t("detail.toast.dossierUpdated") });
          setOpen(false);
        },
        onError: (error) => {
          if (error.status === 409) {
            queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(room.id) });
            toast({
              title: t("detail.toast.roomChangedConflict"),
              description: t("detail.toast.roomChangedConflictDesc"),
              variant: "destructive",
            });
            setOpen(false);
          } else {
            toast({ title: t("detail.toast.updateFailed"), variant: "destructive" });
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> {t("detail.dossier.edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("detail.editDialog.title")}</DialogTitle>
          <DialogDescription>{t("detail.editDialog.description", { name: room.name })}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-area">{t("detail.editDialog.area")}</Label>
            <Input id="d-area" type="number" min={0} value={areaM2} onChange={(e) => setAreaM2(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-func">{t("detail.editDialog.function")}</Label>
            <Input id="d-func" value={functionType} onChange={(e) => setFunctionType(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-vvo">{t("detail.editDialog.vvo")}</Label>
            <Input id="d-vvo" type="number" min={0} value={areaVvo} onChange={(e) => setAreaVvo(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-bvo">{t("detail.editDialog.bvo")}</Label>
            <Input id="d-bvo" type="number" min={0} value={areaBvo} onChange={(e) => setAreaBvo(e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="d-dept">{t("detail.editDialog.department")}</Label>
            <Input id="d-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t("detail.editDialog.departmentPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-capacity">{t("detail.editDialog.capacity")}</Label>
            <Input id="d-capacity" type="number" min={0} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder={t("detail.editDialog.capacityPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-bookable">{t("detail.editDialog.bookable")}</Label>
            <div className="flex items-center gap-2 pt-1">
              <Switch id="d-bookable" checked={bookable} onCheckedChange={setBookable} />
              <span className="text-sm text-muted-foreground">{bookable ? t("detail.editDialog.yes") : t("detail.editDialog.no")}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
          <Button onClick={submit} disabled={update.isPending}>{t("common.save", { ns: "common" })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RuimteDetailPage({ id }: { id: string }) {
  const { t } = useTranslation("ruimtes");
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
    return <div>{t("detail.notFound")}</div>;
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
            {room.bookable && <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-transparent">{t("detail.bookableBadge")}</Badge>}
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
                  <Info className="h-5 w-5" /> {t("detail.dossier.title")}
                </CardTitle>
                {canEdit && <DossierEditDialog key={room.id} room={room} />}
              </div>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Maximize className="h-4 w-4" /> {t("detail.dossier.area")}
                  </dt>
                  <dd className="font-medium text-base">{room.areaM2} m²</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Maximize className="h-4 w-4" /> {t("detail.dossier.vvo")}
                  </dt>
                  <dd className="font-medium text-base">{room.areaVvoM2 != null ? `${room.areaVvoM2} m²` : "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Maximize className="h-4 w-4" /> {t("detail.dossier.bvo")}
                  </dt>
                  <dd className="font-medium text-base">{room.areaBvoM2 != null ? `${room.areaBvoM2} m²` : "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Briefcase className="h-4 w-4" /> {t("detail.dossier.department")}
                  </dt>
                  <dd className="font-medium text-base">{room.department || "-"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Users className="h-4 w-4" /> {t("detail.dossier.capacity")}
                  </dt>
                  <dd className="font-medium text-base">{room.capacity != null ? t("detail.dossier.capacityValue", { count: room.capacity }) : "–"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <LayoutGrid className="h-4 w-4" /> {t("detail.dossier.function")}
                  </dt>
                  <dd className="font-medium text-base capitalize">{room.functionType || "–"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Layers className="h-4 w-4" /> {t("detail.dossier.floorFinish")}
                  </dt>
                  <dd className="font-medium text-base">{room.floorFinish || "–"}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" /> {t("detail.dossier.bookability")}
                  </dt>
                  <dd className="font-medium text-base">{room.bookable ? t("detail.dossier.bookable") : t("detail.dossier.notBookable")}</dd>
                </div>
              </dl>

              {room.facilities?.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h4 className="font-medium mb-3">{t("detail.dossier.facilities")}</h4>
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
                <PcCase className="h-4 w-4 mr-2" /> {t("detail.tabs.assets", { count: assets?.length || 0 })}
              </TabsTrigger>
              <TabsTrigger value="tickets">
                <Ticket className="h-4 w-4 mr-2" /> {t("detail.tabs.tickets", { count: roomTickets.length })}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="assets" className="mt-4">
              <Card>
                <div className="divide-y">
                  {!assets?.length ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">{t("detail.tabs.noAssets")}</div>
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
                    <div className="p-8 text-center text-muted-foreground text-sm">{t("detail.tabs.noTickets")}</div>
                  ) : (
                    roomTickets.map(ticket => (
                      <div key={ticket.id} className="p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer" onClick={() => setLocation(`/meldingen/${ticket.id}`)}>
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="font-medium text-sm truncate">{ticket.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(ticket.createdAt), "d MMM", { locale: getDateFnsLocale() })} • {ticket.categoryName}
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
                  <CalendarDays className="h-4 w-4" /> {t("detail.reservations.title")}
                </CardTitle>
                <CardDescription>{format(new Date(), "EEEE d MMMM", { locale: getDateFnsLocale() })}</CardDescription>
              </CardHeader>
              <CardContent>
                {!reservations?.length ? (
                  <p className="text-sm text-muted-foreground">{t("detail.reservations.empty")}</p>
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
                  {t("detail.reservations.toPlanboard")}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function formatValue(v: string | number | null | undefined, emptyLabel: string) {
  return v === null || v === undefined || v === "" ? emptyLabel : String(v);
}

function DossierHistoryCard({ roomId }: { roomId: number }) {
  const { t } = useTranslation("ruimtes");
  const fieldLabel = (f: string) => t(`detail.fields.${f}`, f);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: history, isLoading } = useListRoomDossierHistory(roomId, {
    query: { queryKey: getListRoomDossierHistoryQueryKey(roomId) },
  });
  const undo = useUndoRoomDossierEntry();
  const [pendingEntryId, setPendingEntryId] = useState<number | null>(null);

  const doUndo = (entryId: number) => {
    setPendingEntryId(entryId);
    undo.mutate(
      { id: roomId, entryId },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getGetRoomQueryKey(roomId) });
          queryClient.invalidateQueries({ queryKey: getListRoomDossierHistoryQueryKey(roomId) });
          if (result.skippedFields.length > 0) {
            const labels = result.skippedFields
              .map((f) => fieldLabel(f))
              .join(", ");
            toast({
              title: t("detail.toast.partialUndo"),
              description: t("detail.toast.partialUndoDesc", { fields: labels }),
            });
          } else {
            toast({ title: t("detail.toast.undone") });
          }
        },
        onError: (err: unknown) => {
          const msg = (err as { message?: string })?.message;
          toast({
            title: t("detail.toast.undoFailed"),
            description: msg ?? undefined,
            variant: "destructive",
          });
        },
        onSettled: () => setPendingEntryId(null),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" /> {t("detail.history.title")}
        </CardTitle>
        <CardDescription>{t("detail.history.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !history?.length ? (
          <p className="text-sm text-muted-foreground">{t("detail.history.empty")}</p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="text-sm border rounded-lg p-3 bg-muted/30">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{entry.changedByName ?? t("detail.history.unknown")}</span>
                    {entry.isUndo && (
                      <Badge variant="secondary" className="text-[10px]">{t("detail.history.reverted")}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(entry.changedAt as string), "d MMM yyyy HH:mm", { locale: getDateFnsLocale() })}
                    </span>
                  </div>
                  {!entry.isUndo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs shrink-0"
                      disabled={undo.isPending && pendingEntryId === entry.id}
                      onClick={() => doUndo(entry.id)}
                    >
                      <Undo2 className="h-3 w-3 mr-1" />
                      {t("detail.history.undo")}
                    </Button>
                  )}
                </div>
                <ul className="space-y-0.5 text-muted-foreground">
                  {(entry.changes as { field: string; from: string | number | null; to: string | number | null }[]).map((c, i) => (
                    <li key={i}>
                      <span className="text-foreground">{fieldLabel(c.field)}</span>
                      : {formatValue(c.from, t("detail.history.emptyValue"))} → {formatValue(c.to, t("detail.history.emptyValue"))}
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
