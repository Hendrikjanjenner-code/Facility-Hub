import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { getDateFnsLocale } from "@/i18n";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetKey,
  useIssueKey,
  useReturnKey,
  useReportKeyLoss,
  useUpdateKey,
  useUpdateKeyIssueDue,
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
  Clock,
  CalendarClock,
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
import { cn } from "@/lib/utils";

const euro = (n: number) => `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}`;

export default function SleutelDetailPage({ id }: { id: string }) {
  const { t } = useTranslation("sleutelbeheer");
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
  const updateIssueDue = useUpdateKeyIssueDue();
  const createDoor = useCreateKeyDoor();
  const deleteDoor = useDeleteKeyDoor();

  const [issueOpen, setIssueOpen] = useState(false);
  const [issueHolderId, setIssueHolderId] = useState<string>("");
  const [issueDueAt, setIssueDueAt] = useState<string>("");
  const [issueNote, setIssueNote] = useState("");

  const [lossOpen, setLossOpen] = useState(false);
  const [lossCharge, setLossCharge] = useState<string>("");
  const [lossNote, setLossNote] = useState("");

  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueDateValue, setDueDateValue] = useState<string>("");

  const [doorOpen, setDoorOpen] = useState(false);
  const [doorDescription, setDoorDescription] = useState("");
  const [doorRoomId, setDoorRoomId] = useState<string>("none");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetKeyQueryKey(keyId) });
    queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
  };
  const onError = (e: any) =>
    toast({ title: e?.response?.data?.message ?? t("detail.actionFailed"), variant: "destructive" });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!detail) return <div>{t("detail.notFound")}</div>;

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
            <Badge variant="secondary" className={KEY_STATUS_STYLES[key.status] ?? ""} data-testid="badge-key-status">{t(`status.${key.status}`, key.status)}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {key.description} {key.buildingName ? `• ${key.buildingName}` : ""}
            {key.replacementCost != null ? ` • ${t("detail.replacementCostLabel", { cost: euro(key.replacementCost) })}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {key.status === "beschikbaar" && (
            <>
              <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-uitgeven"><UserCheck className="h-4 w-4 mr-1.5" /> {t("detail.issue")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("detail.issueDialog.title")}</DialogTitle>
                    <DialogDescription>{t("detail.issueDialog.description", { code: key.code })}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{t("detail.issueDialog.employee")}</Label>
                      <Select value={issueHolderId} onValueChange={setIssueHolderId}>
                        <SelectTrigger data-testid="select-houder"><SelectValue placeholder={t("detail.issueDialog.employeePlaceholder")} /></SelectTrigger>
                        <SelectContent>
                          {users?.map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="i-due">{t("detail.issueDialog.dueDate")}</Label>
                      <Input
                        id="i-due"
                        type="date"
                        value={issueDueAt}
                        onChange={(e) => setIssueDueAt(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">{t("detail.issueDialog.dueDateHint")}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="i-note">{t("detail.issueDialog.note")}</Label>
                      <Input id="i-note" value={issueNote} onChange={(e) => setIssueNote(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIssueOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                    <Button
                      disabled={!issueHolderId || issueKey.isPending}
                      onClick={() =>
                        issueKey.mutate(
                          {
                            id: keyId,
                            data: {
                              holderId: Number(issueHolderId),
                              dueAt: issueDueAt ? new Date(issueDueAt).toISOString() : undefined,
                              note: issueNote || undefined,
                            },
                          },
                          {
                            onSuccess: () => { invalidate(); toast({ title: t("detail.toast.issued") }); setIssueOpen(false); setIssueHolderId(""); setIssueDueAt(""); setIssueNote(""); },
                            onError,
                          },
                        )
                      }
                      data-testid="button-bevestig-uitgifte"
                    >
                      {t("detail.issueDialog.confirm")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                onClick={() =>
                  updateKey.mutate(
                    { id: keyId, data: { status: "geblokkeerd" } },
                    { onSuccess: () => { invalidate(); toast({ title: t("detail.toast.blocked") }); }, onError },
                  )
                }
              >
                <Lock className="h-4 w-4 mr-1.5" /> {t("detail.block")}
              </Button>
            </>
          )}
          {key.status === "uitgegeven" && (
            <Button
              onClick={() =>
                returnKey.mutate(
                  { id: keyId },
                  { onSuccess: () => { invalidate(); toast({ title: t("detail.toast.returned") }); }, onError },
                )
              }
              data-testid="button-innemen"
            >
              <Undo2 className="h-4 w-4 mr-1.5" /> {t("detail.takeBack")}
            </Button>
          )}
          {(key.status === "geblokkeerd" || key.status === "vermist") && (
            <Button
              variant="outline"
              onClick={() =>
                updateKey.mutate(
                  { id: keyId, data: { status: "beschikbaar" } },
                  { onSuccess: () => { invalidate(); toast({ title: t("detail.toast.available") }); }, onError },
                )
              }
            >
              <Unlock className="h-4 w-4 mr-1.5" /> {t("detail.makeAvailable")}
            </Button>
          )}
          {key.status !== "vermist" && (
            <Dialog open={lossOpen} onOpenChange={setLossOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" data-testid="button-vermist">
                  <AlertTriangle className="h-4 w-4 mr-1.5" /> {t("detail.reportLost")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("detail.lossDialog.title")}</DialogTitle>
                  <DialogDescription>
                    {t("detail.lossDialog.description", {
                      holder: key.currentHolderName ? t("detail.lossDialog.descriptionHolder", { name: key.currentHolderName }) : "",
                    })}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="l-charge">{t("detail.lossDialog.charge")}</Label>
                    <Input
                      id="l-charge"
                      type="number"
                      min={0}
                      value={lossCharge}
                      onChange={(e) => setLossCharge(e.target.value)}
                      placeholder={key.replacementCost != null ? String(key.replacementCost) : "0"}
                    />
                    <p className="text-xs text-muted-foreground">{t("detail.lossDialog.chargeHint")}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="l-note">{t("detail.lossDialog.note")}</Label>
                    <Input id="l-note" value={lossNote} onChange={(e) => setLossNote(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setLossOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                  <Button
                    variant="destructive"
                    disabled={reportLoss.isPending}
                    onClick={() =>
                      reportLoss.mutate(
                        { id: keyId, data: { chargeAmount: lossCharge ? Number(lossCharge) : undefined, note: lossNote || undefined } },
                        {
                          onSuccess: () => { invalidate(); toast({ title: t("detail.toast.lossStarted"), description: t("detail.toast.lossStartedDesc") }); setLossOpen(false); setLossCharge(""); setLossNote(""); },
                          onError,
                        },
                      )
                    }
                    data-testid="button-bevestig-vermist"
                  >
                    {t("detail.lossDialog.confirm")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {key.status === "uitgegeven" && key.currentHolderName && (() => {
        const overdue = key.dueAt && new Date(key.dueAt) < new Date();
        return (
          <Card className={cn("border-blue-200 bg-blue-50/50", overdue && "border-orange-300 bg-orange-50")}>
            <CardContent className="pt-6 text-sm flex flex-wrap items-center gap-2">
              {overdue ? <Clock className="h-4 w-4 text-orange-600" /> : <UserCheck className="h-4 w-4 text-blue-700" />}
              {t("detail.issuedBanner.issuedTo")}<span className="font-semibold">{key.currentHolderName}</span>
              {key.issuedAt && <>{t("detail.issuedBanner.since", { date: format(new Date(key.issuedAt), "d MMMM yyyy", { locale: getDateFnsLocale() }) })}</>}
              {key.dueAt && (
                <span className={cn("flex items-center gap-1", overdue ? "text-orange-700 font-semibold" : "text-muted-foreground")}>
                  {overdue ? t("detail.issuedBanner.overdue") : t("detail.issuedBanner.dueBy")}
                  {" "}{format(new Date(key.dueAt), "d MMMM yyyy", { locale: getDateFnsLocale() })}
                  {overdue && <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">{t("detail.issuedBanner.overdueBadge")}</Badge>}
                </span>
              )}
              <Dialog open={dueDateOpen} onOpenChange={setDueDateOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs"
                    data-testid="button-edit-due-date"
                    onClick={() => setDueDateValue(key.dueAt ? key.dueAt.substring(0, 10) : "")}
                  >
                    <CalendarClock className="h-3.5 w-3.5 mr-1" />
                    {t("detail.issuedBanner.editDueDate")}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("detail.dueDialog.title")}</DialogTitle>
                    <DialogDescription>
                      {t("detail.dueDialog.description", { name: key.currentHolderName })}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-due-date">{t("detail.dueDialog.label")}</Label>
                    <Input
                      id="edit-due-date"
                      type="date"
                      value={dueDateValue}
                      onChange={(e) => setDueDateValue(e.target.value)}
                      data-testid="input-edit-due-date"
                    />
                    <p className="text-xs text-muted-foreground">{t("detail.dueDialog.hint")}</p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDueDateOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                    <Button
                      disabled={updateIssueDue.isPending}
                      onClick={() =>
                        updateIssueDue.mutate(
                          {
                            id: keyId,
                            data: { dueAt: dueDateValue ? new Date(dueDateValue).toISOString() : null },
                          },
                          {
                            onSuccess: () => {
                              invalidate();
                              toast({ title: t("detail.toast.dueUpdated") });
                              setDueDateOpen(false);
                            },
                            onError,
                          },
                        )
                      }
                      data-testid="button-bevestig-due-date"
                    >
                      {t("common.save", { ns: "common" })}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DoorClosed className="h-4 w-4" /> {t("detail.keyPlan.title")}
                </CardTitle>
                <CardDescription>{t("detail.keyPlan.description", { type: t(`type.${key.type}`, key.type).toLowerCase() })}</CardDescription>
              </div>
              <Dialog open={doorOpen} onOpenChange={setDoorOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> {t("detail.keyPlan.addDoor")}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("detail.keyPlan.doorDialog.title")}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="dd-desc">{t("detail.keyPlan.doorDialog.description")}</Label>
                      <Input id="dd-desc" value={doorDescription} onChange={(e) => setDoorDescription(e.target.value)} placeholder={t("detail.keyPlan.doorDialog.descriptionPlaceholder")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("detail.keyPlan.doorDialog.room")}</Label>
                      <Select value={doorRoomId} onValueChange={setDoorRoomId}>
                        <SelectTrigger data-testid="select-deur-ruimte"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("detail.keyPlan.doorDialog.none")}</SelectItem>
                          {rooms?.map((r) => (
                            <SelectItem key={r.id} value={String(r.id)}>{r.name} ({r.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDoorOpen(false)}>{t("common.cancel", { ns: "common" })}</Button>
                    <Button
                      disabled={!doorDescription.trim() || createDoor.isPending}
                      onClick={() =>
                        createDoor.mutate(
                          { id: keyId, data: { description: doorDescription.trim(), roomId: doorRoomId === "none" ? null : Number(doorRoomId) } },
                          {
                            onSuccess: () => { invalidate(); toast({ title: t("detail.toast.doorAdded") }); setDoorOpen(false); setDoorDescription(""); setDoorRoomId("none"); },
                            onError,
                          },
                        )
                      }
                    >
                      {t("detail.keyPlan.doorDialog.add")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {doors.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">{t("detail.keyPlan.empty")}</div>
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
                          { onSuccess: () => { invalidate(); toast({ title: t("detail.toast.doorRemoved") }); }, onError },
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
              <History className="h-4 w-4" /> {t("detail.issueHistory.title")}
            </CardTitle>
            <CardDescription>{t("detail.issueHistory.description", { type: t(`type.${key.type}`, key.type).toLowerCase() })}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {issues.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">{t("detail.issueHistory.empty")}</div>
              ) : (
                issues.map((i) => (
                  <div key={i.id} className="p-3 px-6 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{i.holderName ?? t("detail.issueHistory.unknown")}</span>
                      <Badge variant={i.returnedAt ? "secondary" : "default"} className="text-[10px]">
                        {i.returnedAt ? t("detail.issueHistory.returned") : t("detail.issueHistory.inUse")}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(i.issuedAt), "d MMM yyyy", { locale: getDateFnsLocale() })}
                      {i.returnedAt && <> – {format(new Date(i.returnedAt), "d MMM yyyy", { locale: getDateFnsLocale() })}</>}
                      {i.issuedByName && <> {t("detail.issueHistory.issuedBy", { name: i.issuedByName })}</>}
                      {i.dueAt && (() => {
                        const od = !i.returnedAt && new Date(i.dueAt) < new Date();
                        return (
                          <span className={cn("ml-1", od ? "text-orange-600 font-medium" : "")}>
                            {" "}{t("detail.issueHistory.dueBy", { date: format(new Date(i.dueAt), "d MMM yyyy", { locale: getDateFnsLocale() }) })}
                            {od && t("detail.issueHistory.overdue")}
                          </span>
                        );
                      })()}
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
              <AlertTriangle className="h-4 w-4" /> {t("detail.lossReports.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {lossReports.map((l) => (
                <div key={l.id} className="p-3 px-6 text-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span>
                      {t("detail.lossReports.reportedOn", { date: format(new Date(l.createdAt), "d MMMM yyyy", { locale: getDateFnsLocale() }) })}
                      {l.holderName && <>{t("detail.lossReports.lastHolder")}<span className="font-medium">{l.holderName}</span></>}
                    </span>
                    <span className="font-semibold">{euro(l.chargeAmount)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {l.reportedByName && <>{t("detail.lossReports.reportedBy", { name: l.reportedByName })}</>}
                    {l.note}
                  </div>
                  {l.ticketId && (
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => setLocation(`/meldingen/${l.ticketId}`)}>
                      {t("detail.lossReports.viewTicket", { number: l.ticketNumber ?? `#${l.ticketId}` })}
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
        {t("detail.createdOn", { date: format(new Date(key.createdAt), "d MMMM yyyy", { locale: getDateFnsLocale() }) })}
      </p>
    </div>
  );
}
