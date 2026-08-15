import { useLocation } from "wouter";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { 
  useGetReservation, 
  useUpdateReservation,
  getGetReservationQueryKey,
  useGetCurrentUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  ArrowLeft, 
  CalendarDays, 
  Clock, 
  MapPin, 
  Users, 
  Coffee,
  QrCode,
  CheckCircle2,
  XCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getReservationStatusColor } from "@/lib/status-helpers";

export default function ReserveringDetailPage({ id }: { id: string }) {
  const reservationId = parseInt(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user } = useGetCurrentUser();
  const { data: reservation, isLoading } = useGetReservation(reservationId, { query: { enabled: !!reservationId, queryKey: getGetReservationQueryKey(reservationId) } });
  const updateReservation = useUpdateReservation();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-12 w-1/3" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!reservation) {
    return <div>Reservering niet gevonden.</div>;
  }

  const handleStatusChange = (status: string) => {
    updateReservation.mutate({ id: reservationId, data: { status } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetReservationQueryKey(reservationId), data);
        toast({ title: `Reservering ${status}` });
      }
    });
  };

  const totalPrice = reservation.cateringOrders?.reduce((acc, order) => acc + (order.quantity * order.unitPrice), 0) || 0;

  const isToday = reservation.date === format(new Date(), "yyyy-MM-dd");

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/reserveringen")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{reservation.title}</h1>
            <Badge variant="secondary" className={getReservationStatusColor(reservation.status)}>
              {reservation.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            Geboekt door {reservation.userName}
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        <div className="md:col-span-3 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    <span className="text-sm">Datum</span>
                  </div>
                  <p className="font-medium capitalize">{format(new Date(reservation.date), "EEEE d MMMM yyyy", { locale: nl })}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span className="text-sm">Tijd</span>
                  </div>
                  <p className="font-medium">{reservation.startTime} - {reservation.endTime}</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="text-sm">Locatie</span>
                  </div>
                  <p className="font-medium">{reservation.roomName || reservation.workplaceName}</p>
                  <p className="text-xs text-muted-foreground">{reservation.buildingName}</p>
                </div>
                {reservation.attendees && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">Personen</span>
                    </div>
                    <p className="font-medium">{reservation.attendees} personen</p>
                  </div>
                )}
              </div>

              {(reservation.setupBufferMin > 0 || reservation.cleanupBufferMin > 0) && (
                <>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-3 text-sm">Operationele planning (Buffers)</h4>
                    <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border">
                      {reservation.setupBufferMin > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Opbouw</p>
                          <p className="font-medium text-sm">{reservation.setupBufferMin} minuten</p>
                        </div>
                      )}
                      {reservation.cleanupBufferMin > 0 && (
                        <div>
                          <p className="text-xs text-muted-foreground">Schoonmaak</p>
                          <p className="font-medium text-sm">{reservation.cleanupBufferMin} minuten</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {reservation.cateringOrders && reservation.cateringOrders.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Coffee className="h-5 w-5 text-primary" />
                      <h4 className="font-medium text-base">Catering bestelling</h4>
                    </div>
                    <div className="space-y-3">
                      {reservation.cateringOrders.map((order) => (
                        <div key={order.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                          <div>
                            <span className="font-medium">{order.quantity}x</span> {order.itemName}
                          </div>
                          <div className="text-muted-foreground">
                            €{(order.quantity * order.unitPrice).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t flex justify-between items-center font-medium">
                      <span>Totaal catering</span>
                      <span>€{totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          {isToday && reservation.status !== 'geannuleerd' && (
            <Card className="border-primary/20 shadow-md">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <QrCode className="h-5 w-5" />
                  Snelle check-in
                </CardTitle>
                <CardDescription>
                  Scan of klik om in te checken bij de ruimte.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {reservation.status === 'bevestigd' && (
                  <div className="flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed rounded-xl w-full aspect-square max-h-48 relative overflow-hidden group">
                    <QrCode className="h-full w-full text-slate-200 group-hover:text-slate-300 transition-colors" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-primary/10 text-primary font-bold px-4 py-2 rounded-full backdrop-blur-sm border border-primary/20">
                        ZAL SCANNEN
                      </div>
                    </div>
                  </div>
                )}

                {reservation.status === 'ingecheckt' && (
                  <div className="flex flex-col items-center justify-center p-6 bg-green-50 text-green-700 border border-green-200 rounded-xl">
                    <CheckCircle2 className="h-12 w-12 mb-2" />
                    <p className="font-medium">Ingecheckt</p>
                    <p className="text-xs opacity-80 mt-1">U kunt de ruimte gebruiken.</p>
                  </div>
                )}
                
                {reservation.status === 'uitgecheckt' && (
                  <div className="flex flex-col items-center justify-center p-6 bg-slate-50 text-slate-600 border rounded-xl">
                    <XCircle className="h-12 w-12 mb-2" />
                    <p className="font-medium">Uitgecheckt</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={reservation.status === 'bevestigd' ? 'default' : 'outline'} 
                    disabled={reservation.status !== 'bevestigd' || updateReservation.isPending}
                    onClick={() => handleStatusChange('ingecheckt')}
                  >
                    Inchecken
                  </Button>
                  <Button 
                    variant={reservation.status === 'ingecheckt' ? 'default' : 'outline'} 
                    disabled={reservation.status !== 'ingecheckt' || updateReservation.isPending}
                    onClick={() => handleStatusChange('uitgecheckt')}
                  >
                    Uitchecken
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {(user?.role === 'facilitair_manager' || user?.role === 'beheerder') && reservation.status !== 'geannuleerd' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Beheer</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  variant="destructive" 
                  className="w-full"
                  disabled={updateReservation.isPending}
                  onClick={() => handleStatusChange('geannuleerd')}
                >
                  Annuleer reservering
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
