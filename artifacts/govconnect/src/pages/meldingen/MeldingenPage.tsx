import { useState } from "react";
import { useLocation } from "wouter";
import { useListTickets, useListTicketCategories, useGetCurrentUser } from "@workspace/api-client-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { Ticket, Search, Plus, Filter, AlertCircle, Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getTicketStatusColor, getTicketStatusLabel, getPriorityColor } from "@/lib/status-helpers";

export default function MeldingenPage() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetCurrentUser();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");

  const { data: categories } = useListTicketCategories();

  const params: any = {};
  if (search) params.search = search;
  if (status !== "all") params.status = status;
  if (priority !== "all") params.priority = priority;
  if (category !== "all") params.category = category;

  const { data: tickets, isLoading } = useListTickets(params);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meldingen</h1>
          <p className="text-muted-foreground">Beheer en bekijk facilitaire meldingen.</p>
        </div>
        
        {user?.role === 'eindgebruiker' && (
          <Button onClick={() => setLocation("/meldingen/nieuw")}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe melding
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Zoeken op nummer of titel..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap sm:flex-nowrap gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle statussen</SelectItem>
              <SelectItem value="nieuw">Nieuw</SelectItem>
              <SelectItem value="in_behandeling">In behandeling</SelectItem>
              <SelectItem value="wacht_op_info">Wacht op info</SelectItem>
              <SelectItem value="ingepland">Ingepland</SelectItem>
              <SelectItem value="gereed">Gereed</SelectItem>
              <SelectItem value="gesloten">Gesloten</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Prioriteit" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle prioriteiten</SelectItem>
              <SelectItem value="P1">P1 (Kritiek)</SelectItem>
              <SelectItem value="P2">P2 (Hoog)</SelectItem>
              <SelectItem value="P3">P3 (Normaal)</SelectItem>
              <SelectItem value="P4">P4 (Laag)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Categorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle categorieën</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : !tickets?.length ? (
        <div className="text-center py-24 bg-card rounded-lg border border-dashed flex flex-col items-center justify-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Ticket className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">Geen meldingen gevonden</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            Pas uw filters aan of controleer of u de juiste zoekterm heeft gebruikt.
          </p>
          {user?.role === 'eindgebruiker' && (
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/meldingen/nieuw")}>
              <Plus className="mr-2 h-4 w-4" /> Maak eerste melding
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {tickets.map((ticket) => {
            const isOverdue = ticket.slaDueAt && new Date(ticket.slaDueAt) < new Date() && ticket.status !== 'gereed' && ticket.status !== 'gesloten';
            
            return (
              <Card 
                key={ticket.id} 
                className="cursor-pointer hover:border-primary/50 transition-colors group overflow-hidden"
                onClick={() => setLocation(`/meldingen/${ticket.id}`)}
              >
                <div className="flex flex-col sm:flex-row p-4 gap-4 sm:items-center">
                  <div className="flex flex-col gap-1 w-[120px] flex-shrink-0">
                    <span className="font-mono text-sm font-semibold text-primary">{ticket.number}</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(ticket.createdAt), "d MMM yyyy", { locale: nl })}
                    </span>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
                        {ticket.title}
                      </h3>
                      {isOverdue && (
                        <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                      <span className="truncate">{ticket.categoryName}</span>
                      {ticket.roomName && (
                        <>
                          <span>•</span>
                          <span className="truncate">{ticket.roomName}</span>
                        </>
                      )}
                      {ticket.reporterName && (
                        <>
                          <span>•</span>
                          <span className="truncate">Gemeld door: {ticket.reporterName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-3 flex-shrink-0 ml-auto w-full sm:w-auto">
                    <div className="flex gap-2">
                      <Badge variant="outline" className={getPriorityColor(ticket.priority)}>
                        {ticket.priority}
                      </Badge>
                      <Badge variant="secondary" className={`${getTicketStatusColor(ticket.status)} border-0 font-medium`}>
                        {getTicketStatusLabel(ticket.status)}
                      </Badge>
                    </div>
                    
                    {(user?.role !== 'eindgebruiker') && ticket.assigneeName && (
                      <div className="text-xs text-muted-foreground hidden sm:block">
                        Toegewezen: <span className="font-medium text-foreground">{ticket.assigneeName}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
