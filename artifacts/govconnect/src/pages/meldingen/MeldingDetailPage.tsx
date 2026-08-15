import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { nl } from "date-fns/locale";
import { 
  useGetTicket, 
  useListTicketComments, 
  useCreateTicketComment, 
  useUpdateTicket,
  useListUsers,
  getListUsersQueryKey,
  useGetCurrentUser,
  getGetTicketQueryKey,
  getListTicketCommentsQueryKey,
  useSubmitTicketSatisfaction,
  useGetMyTicketSatisfaction,
  getGetMyTicketSatisfactionQueryKey,
  type TicketSatisfaction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, 
  MessageSquare, 
  Clock, 
  MapPin, 
  User as UserIcon, 
  Send,
  Loader2,
  Calendar,
  PcCase,
  CheckCircle2,
  Circle,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import { getTicketStatusColor, getTicketStatusLabel, getPriorityColor, cn } from "@/lib/status-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const STATUS_FLOW = [
  'nieuw',
  'in_behandeling',
  'wacht_op_info',
  'ingepland',
  'gereed',
  'gesloten'
];

function SlaTimer({ dueAt, status }: { dueAt?: string | null, status: string }) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isOverdue, setIsOverdue] = useState(false);

  useEffect(() => {
    if (!dueAt || status === 'gereed' || status === 'gesloten') return;

    const interval = setInterval(() => {
      const due = new Date(dueAt);
      const now = new Date();
      setIsOverdue(isPast(due));
      
      const diffMs = due.getTime() - now.getTime();
      const absDiff = Math.abs(diffMs);
      
      const hours = Math.floor(absDiff / (1000 * 60 * 60));
      const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);
      
      setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [dueAt, status]);

  if (!dueAt) return <span className="text-muted-foreground">Geen SLA</span>;
  if (status === 'gereed' || status === 'gesloten') return <span className="text-muted-foreground">SLA gestopt</span>;

  return (
    <div className={cn("font-mono font-medium flex items-center gap-1.5", isOverdue ? "text-destructive" : "text-primary")}>
      <Clock className="h-3.5 w-3.5" />
      {isOverdue ? "-" : ""}{timeLeft}
    </div>
  );
}

export default function MeldingDetailPage({ id }: { id: string }) {
  const ticketId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const { data: ticket, isLoading } = useGetTicket(ticketId, { query: { enabled: !!ticketId, queryKey: getGetTicketQueryKey(ticketId) } });
  const { data: comments } = useListTicketComments(ticketId, { query: { enabled: !!ticketId, queryKey: getListTicketCommentsQueryKey(ticketId) } });
  const canAssign = !!user && ["servicedesk", "facilitair_manager", "beheerder", "receptie"].includes(user.role);
  const { data: users } = useListUsers({ query: { enabled: canAssign, queryKey: getListUsersQueryKey() } });
  
  const createComment = useCreateTicketComment();
  const updateTicket = useUpdateTicket();
  const submitSatisfaction = useSubmitTicketSatisfaction();
  const { data: existingSatisfaction } = useGetMyTicketSatisfaction(ticketId, {
    query: {
      enabled: !!ticket && ticket.status === "gesloten" && ticket.reporterId === user?.id,
      retry: false,
      queryKey: getGetMyTicketSatisfactionQueryKey(ticketId),
    },
  });

  const [commentBody, setCommentBody] = useState("");
  const [satisfactionDialogOpen, setSatisfactionDialogOpen] = useState(false);
  const [satisfactionScore, setSatisfactionScore] = useState(0);
  const [satisfactionComment, setSatisfactionComment] = useState("");

  const isPrivileged = user?.role !== 'eindgebruiker' && user?.role !== 'cateraar' && user?.role !== 'receptie';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <div className="grid md:grid-cols-3 gap-6">
          <Skeleton className="md:col-span-2 h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return <div>Melding niet gevonden.</div>;
  }

  const handleStatusChange = (newStatus: string) => {
    updateTicket.mutate({ id: ticketId, data: { status: newStatus } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetTicketQueryKey(ticketId), data);
        toast({ title: "Status bijgewerkt" });
      }
    });
  };

  const handleAssigneeChange = (assigneeId: string) => {
    updateTicket.mutate({ id: ticketId, data: { assigneeId: assigneeId === "none" ? null : parseInt(assigneeId) } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetTicketQueryKey(ticketId), data);
        toast({ title: "Toewijzing bijgewerkt" });
      }
    });
  };

  const handlePriorityChange = (priority: string) => {
    updateTicket.mutate({ id: ticketId, data: { priority } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetTicketQueryKey(ticketId), data);
        toast({ title: "Prioriteit bijgewerkt" });
      }
    });
  };

  const handleSatisfactionSubmit = () => {
    if (satisfactionScore < 1) return;
    submitSatisfaction.mutate(
      { id: ticketId, data: { score: satisfactionScore, comment: satisfactionComment || null } },
      {
        onSuccess: (data) => {
          // Immediately populate the cache so the rating renders without a refresh
          queryClient.setQueryData<TicketSatisfaction>(
            getGetMyTicketSatisfactionQueryKey(ticketId),
            data,
          );
          setSatisfactionDialogOpen(false);
          toast({ title: "Beoordeling ingediend", description: "Bedankt voor uw feedback!" });
        },
        onError: () => {
          toast({ variant: "destructive", title: "Fout", description: "Kon beoordeling niet opslaan." });
        },
      },
    );
  };

  const submitComment = () => {
    if (!commentBody.trim()) return;
    createComment.mutate({ id: ticketId, data: { body: commentBody } }, {
      onSuccess: () => {
        setCommentBody("");
        queryClient.invalidateQueries({ queryKey: getListTicketCommentsQueryKey(ticketId) });
      }
    });
  };

  const currentStatusIndex = STATUS_FLOW.indexOf(ticket.status);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      {/* Satisfaction rating dialog */}
      <Dialog open={satisfactionDialogOpen} onOpenChange={setSatisfactionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hoe tevreden bent u?</DialogTitle>
            <DialogDescription>
              Geef een beoordeling voor de afhandeling van deze melding. Uw feedback helpt ons verbeteren.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center gap-2 py-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setSatisfactionScore(star)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      star <= satisfactionScore
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground",
                    )}
                  />
                </button>
              ))}
            </div>
            <div className="text-center text-sm text-muted-foreground">
              {satisfactionScore === 0 && "Klik op een ster om te beoordelen"}
              {satisfactionScore === 1 && "Zeer ontevreden"}
              {satisfactionScore === 2 && "Ontevreden"}
              {satisfactionScore === 3 && "Neutraal"}
              {satisfactionScore === 4 && "Tevreden"}
              {satisfactionScore === 5 && "Zeer tevreden"}
            </div>
            <div className="space-y-1.5">
              <Label>Opmerking (optioneel)</Label>
              <Textarea
                value={satisfactionComment}
                onChange={(e) => setSatisfactionComment(e.target.value)}
                placeholder="Heeft u nog aanvullende opmerkingen?"
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSatisfactionDialogOpen(false)}>Overslaan</Button>
            <Button
              onClick={handleSatisfactionSubmit}
              disabled={satisfactionScore < 1 || submitSatisfaction.isPending}
            >
              {submitSatisfaction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Versturen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/meldingen")} className="flex-shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{ticket.title}</h1>
              <Badge variant="outline" className="font-mono bg-background">{ticket.number}</Badge>
            </div>
            <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
              Aangemaakt op {format(new Date(ticket.createdAt), "d MMMM yyyy HH:mm", { locale: nl })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Satisfaction button for reporter of closed tickets */}
          {ticket.status === "gesloten" && user?.id === ticket.reporterId && (
            existingSatisfaction ? (
              <div className="flex items-center gap-1 text-sm text-muted-foreground border rounded-md px-3 py-1.5">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className={cn("h-3.5 w-3.5", s <= existingSatisfaction.score ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
                ))}
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setSatisfactionDialogOpen(true)}>
                <Star className="mr-2 h-4 w-4" />
                Beoordelen
              </Button>
            )
          )}
          {isPrivileged && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Status: {getTicketStatusLabel(ticket.status)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Wijzig status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STATUS_FLOW.map((s) => (
                  <DropdownMenuItem 
                    key={s} 
                    onClick={() => handleStatusChange(s)}
                    className={ticket.status === s ? "bg-muted" : ""}
                  >
                    {getTicketStatusLabel(s)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Stepper */}
      <Card className="overflow-hidden">
        <div className="p-6 overflow-x-auto">
          <div className="flex items-center min-w-[600px]">
            {STATUS_FLOW.map((s, idx) => {
              const isCompleted = idx < currentStatusIndex || ticket.status === 'gesloten' || ticket.status === 'gereed';
              const isCurrent = idx === currentStatusIndex;
              
              return (
                <div key={s} className="flex-1 flex items-center relative">
                  <div className="flex flex-col items-center relative z-10 w-full group">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center border-2 bg-background transition-colors",
                      isCompleted ? "border-primary text-primary" : isCurrent ? "border-primary bg-primary text-primary-foreground" : "border-muted text-muted-foreground"
                    )}>
                      {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-3 w-3 fill-current" />}
                    </div>
                    <span className={cn(
                      "text-xs font-medium mt-2 whitespace-nowrap",
                      isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {getTicketStatusLabel(s)}
                    </span>
                  </div>
                  {idx < STATUS_FLOW.length - 1 && (
                    <div className={cn(
                      "absolute top-4 left-1/2 w-full h-[2px] -translate-y-1/2",
                      isCompleted ? "bg-primary" : "bg-muted"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Omschrijving</CardTitle>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none text-sm">
              <p className="whitespace-pre-wrap">{ticket.description}</p>
            </CardContent>
            {ticket.formData && Object.keys(ticket.formData).length > 0 && (
              <>
                <Separator />
                <CardHeader>
                  <CardTitle className="text-base">Aanvullende informatie</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 text-sm">
                    {Object.entries(ticket.formData).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <dt className="text-muted-foreground font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Opmerkingen & Updates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                {!comments?.length ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nog geen opmerkingen.</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-4">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium">{comment.authorName?.charAt(0) || '?'}</span>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{comment.authorName}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: nl })}
                          </span>
                          {comment.authorRole !== 'eindgebruiker' && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0">{comment.authorRole?.replace('_', ' ')}</Badge>
                          )}
                        </div>
                        <div className="text-sm bg-muted/50 p-3 rounded-lg whitespace-pre-wrap">
                          {comment.body}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-4 items-start pt-4 border-t">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium">{user?.name.charAt(0)}</span>
                </div>
                <div className="flex-1 space-y-2">
                  <Textarea 
                    placeholder="Plaats een update of opmerking..." 
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    className="min-h-[80px]"
                  />
                  <div className="flex justify-end">
                    <Button onClick={submitComment} disabled={createComment.isPending || !commentBody.trim()}>
                      {createComment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      Verzenden
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-1">
                <span className="text-muted-foreground block">Prioriteit</span>
                {isPrivileged ? (
                  <Select value={ticket.priority} onValueChange={handlePriorityChange}>
                    <SelectTrigger className="h-8 w-fit">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getPriorityColor(ticket.priority)}>
                          {ticket.priority}
                        </Badge>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {['P1', 'P2', 'P3', 'P4'].map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="outline" className={getPriorityColor(ticket.priority)}>
                    {ticket.priority}
                  </Badge>
                )}
              </div>

              <Separator />

              <div className="space-y-1">
                <span className="text-muted-foreground block">SLA</span>
                <SlaTimer dueAt={ticket.slaDueAt} status={ticket.status} />
              </div>

              <Separator />

              <div className="space-y-1">
                <span className="text-muted-foreground block">Categorie</span>
                <span className="font-medium">{ticket.categoryName}</span>
              </div>

              <Separator />

              <div className="space-y-1">
                <span className="text-muted-foreground block">Locatie</span>
                {ticket.roomName ? (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{ticket.roomName} {ticket.buildingName ? `(${ticket.buildingName})` : ''}</span>
                  </div>
                ) : (
                  <span className="italic text-muted-foreground">Geen locatie</span>
                )}
              </div>

              {ticket.assetName && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <span className="text-muted-foreground block">Asset</span>
                    <div className="flex items-center gap-2">
                      <PcCase className="h-4 w-4 text-muted-foreground" />
                      <span>{ticket.assetName}</span>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-1">
                <span className="text-muted-foreground block">Gemeld door</span>
                <div className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                  <span>{ticket.reporterName}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-1">
                <span className="text-muted-foreground block">Toegewezen aan</span>
                {isPrivileged ? (
                  <Select value={ticket.assigneeId?.toString() || "none"} onValueChange={handleAssigneeChange}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Niet toegewezen" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Niet toegewezen</SelectItem>
                      {users?.filter(u => u.role !== 'eindgebruiker').map(u => (
                        <SelectItem key={u.id} value={u.id.toString()}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{ticket.assigneeName || <span className="italic text-muted-foreground">Niet toegewezen</span>}</span>
                  </div>
                )}
              </div>

              {isPrivileged && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <span className="text-muted-foreground block">Gepland op</span>
                    {/* Simplified planning view for now */}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {ticket.plannedAt ? (
                        <span>{format(new Date(ticket.plannedAt), "d MMM yyyy HH:mm", { locale: nl })}</span>
                      ) : (
                        <span className="italic text-muted-foreground">Niet ingepland</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
