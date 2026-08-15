import { useState } from "react";
import { useLocation } from "wouter";
import { format, addDays, subDays, setHours, parseISO } from "date-fns";
import { nl } from "date-fns/locale";
import { 
  useListReservations, 
  useListRooms, 
  useGetCurrentUser,
  useCreateReservation
} from "@workspace/api-client-react";
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  LayoutList, 
  LayoutGrid,
  Filter
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getReservationStatusColor, cn } from "@/lib/status-helpers";
import { NewReservationDialog } from "./NewReservationDialog";

export default function ReserveringenPage() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetCurrentUser();
  const [date, setDate] = useState<Date>(new Date());
  const [view, setView] = useState<"planbord" | "list">("planbord");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  const dateStr = format(date, "yyyy-MM-dd");
  
  const { data: reservations, isLoading: isResLoading } = useListReservations({ date: dateStr, kind: 'room' });
  const { data: rooms, isLoading: isRoomsLoading } = useListRooms({ bookable: true });

  const handlePrevDay = () => setDate(prev => subDays(prev, 1));
  const handleNextDay = () => setDate(prev => addDays(prev, 1));
  const handleToday = () => setDate(new Date());

  const hours = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00 to 19:00

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reserveringen</h1>
          <p className="text-muted-foreground">Beheer ruimte- en cateringreserveringen.</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "planbord" | "list")} className="hidden sm:flex">
            <TabsList>
              <TabsTrigger value="planbord"><LayoutGrid className="h-4 w-4 mr-2" /> Planbord</TabsTrigger>
              <TabsTrigger value="list"><LayoutList className="h-4 w-4 mr-2" /> Lijst</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button onClick={() => setIsNewDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nieuwe reservering
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-card p-2 rounded-lg border shadow-sm w-fit">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handlePrevDay}><ChevronLeft className="h-5 w-5" /></Button>
          <Button variant="ghost" onClick={handleToday} className="px-3">Vandaag</Button>
          <Button variant="ghost" size="icon" onClick={handleNextDay}><ChevronRight className="h-5 w-5" /></Button>
        </div>
        <div className="px-4 font-medium min-w-[160px] text-center capitalize">
          {format(date, "EEEE d MMMM", { locale: nl })}
        </div>
      </div>

      {isResLoading || isRoomsLoading ? (
        <div className="space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : view === "planbord" ? (
        <Card className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header Row */}
            <div className="flex border-b bg-muted/30">
              <div className="w-48 flex-shrink-0 p-3 font-semibold text-sm border-r flex items-center">
                Ruimte
              </div>
              <div className="flex-1 flex">
                {hours.map(h => (
                  <div key={h} className="flex-1 border-r last:border-0 p-2 text-center text-xs font-medium text-muted-foreground relative">
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
            </div>

            {/* Room Rows */}
            <div className="divide-y">
              {rooms?.map(room => {
                const roomRes = reservations?.filter(r => r.roomId === room.id) || [];
                return (
                  <div key={room.id} className="flex hover:bg-muted/10 transition-colors">
                    <div className="w-48 flex-shrink-0 p-3 border-r">
                      <p className="font-medium text-sm truncate">{room.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{room.capacity} pers. • {room.buildingName}</p>
                    </div>
                    <div className="flex-1 relative flex">
                      {/* Grid lines */}
                      {hours.map(h => (
                        <div key={h} className="flex-1 border-r last:border-0 h-full min-h-[64px]" />
                      ))}
                      
                      {/* Reservations */}
                      {roomRes.map(res => {
                        const start = parseInt(res.startTime.split(':')[0]) + (parseInt(res.startTime.split(':')[1]) / 60);
                        const end = parseInt(res.endTime.split(':')[0]) + (parseInt(res.endTime.split(':')[1]) / 60);
                        
                        if (end <= 7 || start >= 20) return null; // Outside planboard view
                        
                        const left = Math.max(0, ((start - 7) / 13) * 100);
                        const width = Math.min(100 - left, ((end - start) / 13) * 100);
                        
                        // Buffer calculations
                        const setupLeft = Math.max(0, (((start - (res.setupBufferMin/60)) - 7) / 13) * 100);
                        const setupWidth = left - setupLeft;
                        const cleanupWidth = (((res.cleanupBufferMin/60) / 13) * 100);
                        
                        return (
                          <div 
                            key={res.id} 
                            className="absolute top-2 bottom-2 group cursor-pointer"
                            style={{ left: `${left}%`, width: `${width}%` }}
                            onClick={() => setLocation(`/reserveringen/${res.id}`)}
                          >
                            {/* Setup buffer */}
                            {res.setupBufferMin > 0 && (
                              <div 
                                className="absolute top-0 bottom-0 bg-primary/20 rounded-l-md border border-primary/30 border-r-0 border-dashed"
                                style={{ left: `-${(setupWidth / width) * 100}%`, width: `${(setupWidth / width) * 100}%` }}
                                title={`Opbouw: ${res.setupBufferMin} min`}
                              />
                            )}
                            
                            <div className={cn(
                              "h-full rounded-md border p-1.5 overflow-hidden text-xs transition-shadow shadow-sm group-hover:shadow-md relative z-10",
                              res.status === 'geannuleerd' ? "bg-muted text-muted-foreground border-muted-foreground/30" : "bg-card border-primary/30"
                            )}>
                              <div className="font-semibold truncate">{res.title}</div>
                              <div className="text-muted-foreground truncate">{res.startTime} - {res.endTime}</div>
                              {res.status === 'ingecheckt' && <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-green-500" title="Ingecheckt" />}
                            </div>
                            
                            {/* Cleanup buffer */}
                            {res.cleanupBufferMin > 0 && (
                              <div 
                                className="absolute top-0 bottom-0 bg-primary/20 rounded-r-md border border-primary/30 border-l-0 border-dashed"
                                style={{ right: `-${(cleanupWidth / width) * 100}%`, width: `${(cleanupWidth / width) * 100}%` }}
                                title={`Schoonmaak: ${res.cleanupBufferMin} min`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!rooms?.length && (
                <div className="p-8 text-center text-muted-foreground">Geen boekbare ruimtes gevonden.</div>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {reservations?.length ? reservations.map((res) => (
              <div 
                key={res.id} 
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => setLocation(`/reserveringen/${res.id}`)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 text-center">
                    <div className="text-lg font-bold">{res.startTime}</div>
                    <div className="text-xs text-muted-foreground">{res.endTime}</div>
                  </div>
                  <div className="w-1 h-12 bg-primary/20 rounded-full" />
                  <div>
                    <h3 className="font-semibold">{res.title}</h3>
                    <p className="text-sm text-muted-foreground">{res.roomName} • {res.userName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {res.cateringOrders?.length > 0 && (
                    <Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300">
                      Catering ({res.cateringOrders.length})
                    </Badge>
                  )}
                  <Badge variant="secondary" className={getReservationStatusColor(res.status)}>
                    {res.status}
                  </Badge>
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-muted-foreground">Geen reserveringen voor deze datum.</div>
            )}
          </div>
        </Card>
      )}
      
      {isNewDialogOpen && (
        <NewReservationDialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen} />
      )}
    </div>
  );
}
